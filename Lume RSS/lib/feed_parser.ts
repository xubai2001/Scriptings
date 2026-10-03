/**
 * Feed Parser —— 负责 RSS / RSS 2.0(RDF) / Atom / JSON Feed / Media RSS 的解析。
 * 只做「把 feed 变成结构化数据」，不做任何渲染决策。
 */

import type { ArticleMedia } from "../models"
import { MNode, attrOf, findAll, find, findDeep, nodeText, parseMarkup } from "./markup"
import { collectDeclaredMedia, collectFeedIcon, dedupeMedia, mediaFromHTML } from "./media"
import { canonicalURL, collapse, decodeEntities, hashString, htmlToText, parseDate, resolveURL } from "./utils"

export interface ParsedFeedMeta {
  title: string
  siteURL: string
  description: string
  iconURL?: string
  feedType: "rss" | "atom" | "json"
}

export interface ParsedItem {
  guid: string
  title: string
  url: string
  author?: string
  publishedAt: number
  updatedAt: number
  /** 纯文本摘要 */
  summary: string
  /** 原始 HTML */
  htmlContent: string
  images: ArticleMedia[]
  categories: string[]
}

export interface ParsedFeed {
  meta: ParsedFeedMeta
  items: ParsedItem[]
}

function atomLink(item: MNode): string {
  const links = findAll(item, "link")
  const alternate = links.find((l) => {
    const rel = (attrOf(l, "rel") || "alternate").toLowerCase()
    return rel === "alternate"
  })
  const anyHttp = links.find((l) => /^https?:/i.test(attrOf(l, "href")))
  return attrOf(alternate ?? anyHttp ?? links[0], "href")
}

function categoriesOf(item: MNode): string[] {
  const out: string[] = []
  for (const node of findAll(item, "category")) {
    const value = nodeText(node) || attrOf(node, "term") || attrOf(node, "label")
    if (value && !out.includes(value)) out.push(value)
  }
  return out.slice(0, 8)
}

function authorOf(item: MNode): string | undefined {
  const direct = nodeText(find(item, "creator")) || nodeText(find(item, "dc:creator"))
  if (direct) return collapse(direct, 60)
  const authorNode = find(item, "author")
  if (authorNode) {
    const name = nodeText(find(authorNode, "name")) || nodeText(authorNode)
    if (name) return collapse(name, 60)
  }
  const itunes = nodeText(find(item, "itunes:author"))
  if (itunes) return collapse(itunes, 60)
  return undefined
}

/** 解析一个 RSS <item> 或 Atom <entry> */
function parseItemNode(item: MNode, baseURL: string, feedType: "rss" | "atom"): ParsedItem {
  const linkNode = find(item, "link")
  const rawLink =
    feedType === "atom"
      ? atomLink(item)
      : (linkNode && !attrOf(linkNode, "href") ? nodeText(linkNode) : attrOf(linkNode, "href")) || ""
  const url = resolveURL(baseURL, rawLink.trim())

  let title = htmlToText(nodeText(find(item, "title")))
  if (!title) {
    const dcTitle = htmlToText(nodeText(find(item, "dc:title")))
    title = dcTitle
  }

  const contentEncoded = nodeText(find(item, "content:encoded"))
  const atomContent = find(item, "content")
  const atomContentHTML = atomContent ? (nodeText(atomContent) || innerOf(atomContent)) : ""
  const description = nodeText(find(item, "description")) || nodeText(find(item, "summary")) || nodeText(find(item, "dc:description"))

  // 正文优先级：content:encoded > Atom content > description
  const htmlContent = contentEncoded || atomContentHTML || description

  const summarySource = description || contentEncoded || atomContentHTML
  const summary = collapse(htmlToText(summarySource), 400)

  const puDate = nodeText(find(item, "pubDate")) || nodeText(find(item, "published"))
  const upDate = nodeText(find(item, "updated")) || nodeText(find(item, "dc:date")) || nodeText(find(item, "date"))
  const publishedAt = parseDate(puDate) || parseDate(upDate)
  const updatedAt = parseDate(upDate) || publishedAt

  const guidRaw =
    nodeText(find(item, "guid")) || nodeText(find(item, "id")) || nodeText(find(item, "dc:identifier")) || url
  const guid = decodeEntities(guidRaw).trim()

  const images: ArticleMedia[] = [...collectDeclaredMedia(item, baseURL || url)]
  if (htmlContent) {
    try {
      const parsed = parseMarkup(htmlContent, "html")
      images.push(...mediaFromHTML(parsed, url || baseURL, contentEncoded ? "content" : "description"))
    } catch {
      // 解析失败就算了，媒体层不是关键路径
    }
  }

  return {
    guid,
    title: title || collapse(summary, 120) || "(无标题)",
    url: url || guid,
    author: authorOf(item),
    publishedAt: publishedAt || Date.now(),
    updatedAt: updatedAt || publishedAt || Date.now(),
    summary,
    htmlContent,
    images: dedupeMedia(images),
    categories: categoriesOf(item),
  }
}

function innerOf(node: MNode): string {
  let out = node.text
  for (const child of node.children) out += serializeNode(child)
  return out
}

function serializeNode(node: MNode): string {
  if (node.tag === "#root") return innerOf(node)
  const attrs = Object.keys(node.attrs)
    .map((k) => ` ${k}="${node.attrs[k].replace(/"/g, "&quot;")}"`)
    .join("")
  const inner = node.text + node.children.map(serializeNode).join("")
  return `<${node.tag}${attrs}>${inner}</${node.tag}>`
}

// ── JSON Feed ────────────────────────────────────────────────

function parseJSONFeed(content: string, feedURL: string): ParsedFeed | null {
  let data: any
  try {
    data = JSON.parse(content)
  } catch {
    return null
  }
  if (!data || (!data.items && !data.version)) return null
  const homePage: string = data.home_page_url || ""
  const items: ParsedItem[] = []
  for (const raw of Array.isArray(data.items) ? data.items : []) {
    const htmlContent: string = raw.content_html || raw.content_text || raw.summary || ""
    const parsed = htmlContent.includes("<") ? parseMarkup(htmlContent, "html") : undefined
    const images: ArticleMedia[] = raw.image
      ? [{ id: `json-${hashString(String(raw.id || raw.url))}`, type: "image", url: String(raw.image), source: "content" }]
      : []
    if (parsed) images.push(...mediaFromHTML(parsed, raw.url || homePage, "content"))
    const itemURL = raw.url || raw.external_url || ""
    items.push({
      guid: String(raw.id || itemURL || raw.title || ""),
      title: collapse(raw.title || "", 200) || "(无标题)",
      url: itemURL,
      author: raw.author?.name || raw.authors?.[0]?.name || undefined,
      publishedAt: parseDate(raw.date_published) || parseDate(raw.date_modified) || Date.now(),
      updatedAt: parseDate(raw.date_modified) || parseDate(raw.date_published) || Date.now(),
      summary: collapse(raw.summary || htmlToText(htmlContent), 400),
      htmlContent: raw.content_html || raw.summary || "",
      images: dedupeMedia(images),
      categories: Array.isArray(raw.tags) ? raw.tags.slice(0, 8).map(String) : [],
    })
  }
  return {
    meta: {
      title: collapse(data.title || "", 200) || "未命名订阅",
      siteURL: homePage || feedURL,
      description: collapse(data.description || "", 300),
      iconURL: data.icon || data.favicon || undefined,
      feedType: "json",
    },
    items,
  }
}

// ── XML feed ─────────────────────────────────────────────────

export function parseFeed(content: string, feedURL: string): ParsedFeed {
  const text = (content || "").trim()
  if (!text) throw new Error("订阅源内容为空")
  if (text.startsWith("{")) {
    const json = parseJSONFeed(text, feedURL)
    if (json) return json
    throw new Error("无法识别的 JSON Feed")
  }

  const root = parseMarkup(text)
  const rssRoot = find(root, "rss")
  const feedRoot = find(root, "feed")
  const rdfRoot = find(root, "rdf") ?? (root.children.find((c) => c.tag === "rdf") ? root.children.find((c) => c.tag === "rdf") : undefined)

  if (feedRoot) {
    const items = findAll(feedRoot, "entry").map((entry) => parseItemNode(entry, feedURL, "atom"))
    const linkNode = findAll(feedRoot, "link").find((l) => (attrOf(l, "rel") || "alternate") === "alternate")
    const siteURL = resolveURL(feedURL, attrOf(linkNode ?? findAll(feedRoot, "link")[0], "href"))
    const iconURL =
      (findDeep(feedRoot, "icon")?.text.trim() || "") || (findDeep(feedRoot, "logo")?.text.trim() || "")
    return {
      meta: {
        title: collapse(htmlToText(nodeText(find(feedRoot, "title"))), 200) || "未命名订阅",
        siteURL: siteURL || feedURL,
        description: collapse(htmlToText(nodeText(find(feedRoot, "subtitle"))), 300),
        iconURL: iconURL ? resolveURL(feedURL, iconURL) : undefined,
        feedType: "atom",
      },
      items,
    }
  }

  if (rssRoot) {
    const channel = find(rssRoot, "channel") ?? rssRoot
    const items = findAll(channel, "item").map((item) => parseItemNode(item, feedURL, "rss"))
    const siteURL = resolveURL(feedURL, nodeText(find(channel, "link")))
    return {
      meta: {
        title: collapse(htmlToText(nodeText(find(channel, "title"))), 200) || "未命名订阅",
        siteURL: siteURL || feedURL,
        description: collapse(htmlToText(nodeText(find(channel, "description"))), 300),
        iconURL: collectFeedIcon(channel, feedURL),
        feedType: "rss",
      },
      items,
    }
  }

  // RSS 1.0 (RDF)：item 与 channel 同级
  if (rdfRoot || root.children.some((c) => c.tag === "item")) {
    const container = rdfRoot ?? root
    const items = findAll(container, "item").map((item) => parseItemNode(item, feedURL, "rss"))
    const channel = find(container, "channel")
    const siteURL = resolveURL(feedURL, nodeText(find(channel ?? container, "link")))
    if (items.length || channel) {
      return {
        meta: {
          title: collapse(htmlToText(nodeText(find(channel ?? container, "title"))), 200) || "未命名订阅",
          siteURL: siteURL || feedURL,
          description: collapse(htmlToText(nodeText(find(channel ?? container, "description"))), 300),
          iconURL: channel ? collectFeedIcon(channel, feedURL) : undefined,
          feedType: "rss",
        },
        items,
      }
    }
  }

  throw new Error("这不是一个可识别的订阅源（RSS / Atom / JSON Feed）")
}

// ── 去重键 ───────────────────────────────────────────────────

export function dedupeKeyOf(item: { guid: string; url: string; title: string; publishedAt: number }): string {
  const guid = (item.guid || "").trim()
  if (guid && !/^https?:\/\/example/i.test(guid)) return "g:" + hashString(guid)
  const canonical = canonicalURL(item.url || "")
  if (canonical) return "u:" + hashString(canonical)
  const title = (item.title || "").replace(/\s+/g, "").toLowerCase().slice(0, 80)
  return "t:" + hashString(`${title}|${Math.floor((item.publishedAt || 0) / 3600000)}`)
}

/** 用户输入的地址规范化 */
export function normalizeFeedInput(input: string): string {
  let value = (input || "").trim()
  if (!value) return ""
  value = value.replace(/^feed:\/\//i, "https://").replace(/^feed:/i, "https://")
  if (!/^https?:\/\//i.test(value)) value = "https://" + value.replace(/^\/+/, "")
  return value
}

export function looksLikeFeedURL(url: string): boolean {
  return /(\.rss|\.xml|\.atom|\/feed\/?$|\/rss\/?$|\/atom\/?$|\/index\.xml$|\/feeds?\/|feed=|\?feed=|format=rss|type=rss)/i.test(
    url || ""
  )
}
