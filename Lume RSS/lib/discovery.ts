/**
 * 订阅源发现：用户输入普通网站地址时，自动尝试
 *   1. 它本身是不是 feed
 *   2. HTML <link rel="alternate">
 *   3. 常见 feed 地址
 */

import { FetchError, fetchText } from "./refresh"
import { normalizeFeedInput, parseFeed, looksLikeFeedURL } from "./feed_parser"
import { discoverFeedLinks, discoverIconLinks } from "./content"

export interface DiscoveredFeed {
  url: string
  type: "rss" | "atom" | "json"
  title?: string
}

export interface DiscoveryResult {
  feeds: DiscoveredFeed[]
  siteURL?: string
  iconURL?: string
  title?: string
}

const COMMON_PATHS = [
  "/feed",
  "/rss",
  "/rss.xml",
  "/feed.xml",
  "/atom.xml",
  "/index.xml",
  "/feeds/posts/default",
  "/blog/feed",
  "/?feed=rss2",
]

function typeFromContentType(type: string): "rss" | "atom" | "json" {
  if (/json/i.test(type)) return "json"
  if (/atom/i.test(type)) return "atom"
  return "rss"
}

function dedupe(feeds: DiscoveredFeed[]): DiscoveredFeed[] {
  const seen = new Set<string>()
  const out: DiscoveredFeed[] = []
  for (const feed of feeds) {
    const key = feed.url.replace(/[?#].*$/, "")
    if (seen.has(key)) continue
    seen.add(key)
    out.push(feed)
  }
  return out
}

/** 尝试把一个地址当作 feed 解析 */
async function tryAsFeed(url: string): Promise<DiscoveredFeed | undefined> {
  try {
    const result = await fetchText(url, { timeout: 15000, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*" })
    const text = result.text.trim()
    if (!text) return undefined
    const isFeedShape = /^<\?xml/i.test(text) || /^<rss/i.test(text) || /^<feed/i.test(text) || /^<rdf/i.test(text) || text.startsWith("{")
    if (!isFeedShape && !looksLikeFeedURL(url) && !/xml|json/i.test(result.contentType)) return undefined
    const parsed = parseFeed(text, url)
    return { url, type: parsed.meta.feedType, title: parsed.meta.title }
  } catch {
    return undefined
  }
}

export async function discoverFeeds(input: string): Promise<DiscoveryResult> {
  const url = normalizeFeedInput(input)
  if (!url) throw new FetchError("empty", "请输入有效的地址")

  // 1. 直接当 feed 试
  const direct = await tryAsFeed(url)
  if (direct) {
    // 顺带拿到 site URL 与图标
    try {
      const page = await fetchText(direct.url, { timeout: 15000 })
      const parsed = parseFeed(page.text, direct.url)
      return { feeds: [direct], siteURL: parsed.meta.siteURL, iconURL: parsed.meta.iconURL, title: parsed.meta.title }
    } catch {
      return { feeds: [direct], title: direct.title }
    }
  }

  // 2. 当作网页：找 <link rel="alternate">
  const page = await fetchText(url, { accept: "text/html,application/xhtml+xml" })
  const links = discoverFeedLinks(page.text, url)
  const icons = discoverIconLinks(page.text, url)

  const candidates: DiscoveredFeed[] = links.map((link) => ({
    url: link.url,
    type: typeFromContentType(link.type) === "json" ? "json" : link.type.includes("atom") ? "atom" : "rss",
    title: link.title,
  }))

  // 3. 常见地址兜底
  if (!candidates.length) {
    const origin = url.replace(/^(https?:\/\/[^/]+).*$/i, "$1")
    const probes = COMMON_PATHS.slice(0, 6).map((path) => `${origin}${path}`)
    const results = await Promise.all(probes.map((probe) => tryAsFeed(probe)))
    for (const result of results) if (result) candidates.push(result)
  }

  const feeds = dedupe(candidates)
  if (!feeds.length) {
    throw new FetchError("nofeed", "没有找到可用的订阅源", "这个地址可能没有提供 RSS / Atom")
  }

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(page.text)
  return {
    feeds,
    siteURL: url,
    iconURL: icons[0],
    title: titleMatch ? titleMatch[1].trim() : undefined,
  }
}

/** 生成 favicon 兜底地址 */
export function faviconURL(siteURL: string): string | undefined {
  const m = /^https?:\/\/([^/]+)/i.exec(siteURL || "")
  if (!m) return undefined
  return `https://www.google.com/s2/favicons?domain=${m[1]}&sz=128`
}
