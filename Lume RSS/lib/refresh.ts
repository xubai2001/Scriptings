/**
 * 网络层：拉取 feed、解析、合并去重、抓取原网页正文。
 *
 * 刷新是「每个 feed 独立」的：一个源失败不影响其他源，
 * 失败信息以友好文案记录到 feed.lastError，而不是抛系统 Alert。
 */

import { fetch } from "scripting"
import type { Article, Feed, FeedRefreshStatus } from "../models"
import { extractWebArticle } from "./content"
import { ParsedFeed, ParsedItem, dedupeKeyOf, parseFeed } from "./feed_parser"
import { dedupeMedia } from "./media"
import { store } from "./store"
import { collapse, estimateReadingMinutes, hashString, htmlToText } from "./utils"

const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Lume/1.0"
const DEFAULT_TIMEOUT = 20000

export interface FetchTextResult {
  url: string
  finalURL: string
  text: string
  contentType: string
  status: number
}

export class FetchError extends Error {
  code: string
  detail?: string
  constructor(code: string, message: string, detail?: string) {
    super(message)
    this.code = code
    this.detail = detail
  }
}

function friendlyHTTPError(status: number, url: string): FetchError {
  if (status === 401 || status === 403) return new FetchError("auth", "这个地址需要登录才能访问", `HTTP ${status}`)
  if (status === 404) return new FetchError("notfound", "订阅地址不存在", `HTTP ${status}`)
  if (status === 429) return new FetchError("ratelimit", "请求过于频繁，请稍后再试", `HTTP ${status}`)
  if (status >= 500) return new FetchError("server", "订阅源服务器暂时不可用", `HTTP ${status}`)
  return new FetchError("http", `请求失败`, `HTTP ${status}`)
}

/** 带超时的文本请求 */
export async function fetchText(
  url: string,
  options: { timeout?: number; accept?: string; headers?: Record<string, string> } = {}
): Promise<FetchTextResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT
  let timer: unknown = null
  try {
    const response = await Promise.race([
      fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: options.accept ?? "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, application/json, */*",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          ...(options.headers ?? {}),
        },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new FetchError("timeout", "网络请求超时")), timeout)
      }),
    ])

    if (!response.ok) throw friendlyHTTPError(response.status, url)
    const text = await response.text()
    let contentType = ""
    try {
      contentType = response.headers.get("content-type") ?? ""
    } catch {
      contentType = ""
    }
    return { url, finalURL: url, text, contentType, status: response.status }
  } catch (error) {
    if (error instanceof FetchError) throw error
    const message = String((error as Error)?.message ?? error)
    if (/abort|timeout/i.test(message)) throw new FetchError("timeout", "网络请求超时")
    throw new FetchError("network", "网络连接失败，请检查网络后重试", message)
  } finally {
    if (timer != null) clearTimeout(timer as number)
  }
}

// ── feed 解析 ────────────────────────────────────────────────

export async function fetchAndParseFeed(feedURL: string): Promise<ParsedFeed> {
  const result = await fetchText(feedURL)
  const parsed = parseFeed(result.text, feedURL)
  if (!parsed.items.length && !parsed.meta.title) {
    throw new FetchError("empty", "这个订阅源暂时没有内容")
  }
  return parsed
}

// ── 文章构建 ─────────────────────────────────────────────────

function buildFromParsedItem(feed: Feed, item: ParsedItem, existing?: Article): Article {
  const key = dedupeKeyOf(item)
  return store.buildArticle({
    feedID: feed.id,
    dedupeKey: key,
    title: item.title,
    url: item.url,
    author: item.author,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
    summary: item.summary,
    htmlContent: item.htmlContent,
    images: item.images,
    categories: item.categories,
    existing,
  })
}

// ── 单个 feed 的刷新 ─────────────────────────────────────────

export interface RefreshOptions {
  /** 一次刷新最多处理多少条（首刷可以全量） */
  limit?: number
  /** 是否顺便补齐正文（首次订阅时用） */
  fetchContent?: boolean
}

export async function refreshFeed(feedID: string, options: RefreshOptions = {}): Promise<number> {
  const feed = store.feedByID(feedID)
  if (!feed) return 0

  store.updateRefreshStatus(feedID, { state: "refreshing", error: undefined, newCount: 0 })

  try {
    const parsed = await fetchAndParseFeed(feed.url)
    const existingList = await store.loadFeedArticles(feedID)
    const byDedupe = new Map(existingList.map((a) => [a.dedupeKey, a]))
    const byID = new Map(existingList.map((a) => [a.id, a]))

    const items = options.limit ? parsed.items.slice(0, options.limit) : parsed.items
    const incoming: Article[] = []
    let newCount = 0

    for (const item of items) {
      const key = dedupeKeyOf(item)
      const candidateID = "a-" + hashString(`${feedID}|${key}`)
      const existing = byDedupe.get(key) ?? byID.get(candidateID)
      if (!existing) newCount++
      incoming.push(buildFromParsedItem(feed, item, existing))
    }

    // feed 窗口滚动时会丢掉旧条目：已存在的旧文章保留
    const incomingIDs = new Set(incoming.map((a) => a.id))
    for (const old of existingList) if (!incomingIDs.has(old.id)) incoming.push(old)

    const trimmed = store.trimArticles(feedID, incoming)
    await store.saveFeedArticles(feedID, trimmed)

    store.updateFeed(feedID, {
      lastUpdated: Date.now(),
      lastSuccessAt: Date.now(),
      lastError: undefined,
      lastErrorAt: undefined,
      lastNewCount: newCount,
      title: feed.title && feed.title !== "未命名订阅" ? feed.title : parsed.meta.title,
      siteURL: feed.siteURL || parsed.meta.siteURL,
      description: feed.description || parsed.meta.description,
      iconURL: feed.iconURL || parsed.meta.iconURL,
      feedType: parsed.meta.feedType,
    })
    store.updateRefreshStatus(feedID, { state: "done", newCount })
    return newCount
  } catch (error) {
    const message = error instanceof FetchError ? error.message : "无法更新"
    store.updateFeed(feedID, { lastError: message, lastErrorAt: Date.now(), lastUpdated: Date.now() })
    store.updateRefreshStatus(feedID, { state: "failed", error: message, newCount: 0 })
    return 0
  }
}

/** 并发刷新多个 feed（刷新过程不阻塞 UI，逐步回传状态） */
export async function refreshFeeds(feedIDs: string[], options: RefreshOptions & { concurrency?: number } = {}): Promise<void> {
  const ids = feedIDs.slice()
  if (!ids.length) return
  const concurrency = Math.max(1, Math.min(4, options.concurrency ?? 3))
  store.setRefreshing(true)
  store.setRefreshStatuses(ids.map((id) => ({ feedID: id, title: store.feedByID(id)?.title ?? "", state: "queued", newCount: 0 })))

  let cursor = 0
  const workers = new Array(Math.min(concurrency, ids.length)).fill(0).map(async () => {
    while (cursor < ids.length) {
      const index = cursor++
      await refreshFeed(ids[index], options)
    }
  })
  try {
    await Promise.all(workers)
  } finally {
    store.setRefreshing(false)
    await store.flush()
    // 有未加载正文的文章时，可以按需在打开文章时补全（见 upgradeArticleContent）
  }
}

export async function refreshAllFeeds(options: RefreshOptions & { concurrency?: number } = {}): Promise<void> {
  const ids = store.feeds.filter((f) => !f.isMuted).map((f) => f.id)
  await refreshFeeds(ids, options)
}

// ── 正文补全（RSS 只给摘要时）────────────────────────────────

/**
 * 正文获取策略：
 *   RSS 完整正文 → content:encoded → description → 原网页正文解析 → 仅摘要
 * RSS 已经提供完整正文时不会再次请求网站。
 */
export async function upgradeArticleContent(articleID: string): Promise<Article | undefined> {
  const article = await store.fullArticle(articleID)
  if (!article) return undefined
  if (article.contentFetched) return article
  if (!article.url) return article
  if (article.blocks.length > 0 && article.contentSource === "feed-full") return article

  try {
    const result = await fetchText(article.url, { accept: "text/html,application/xhtml+xml" })
    if (!/html/i.test(result.contentType) && !/<html/i.test(result.text.slice(0, 400))) {
      return article
    }
    const web = extractWebArticle(result.text, article.url)
    if (!web.blocks.length || web.textLength < 200) {
      const updated: Article = { ...article, contentFetched: true }
      await store.replaceArticle(updated)
      return updated
    }
    const mergedImages = dedupeMedia([...article.images, ...web.images, ...(web.imageURL ? [{ id: "og-" + hashString(web.imageURL), type: "image" as const, url: web.imageURL, source: "og:image" as const }] : [])])
    const plain = web.blocks
      .map((b) => (b.kind === "paragraph" || b.kind === "heading" ? b.text : ""))
      .join("\n")
    const updated: Article = {
      ...article,
      blocks: web.blocks,
      htmlContent: web.html,
      images: mergedImages,
      contentSource: "web",
      contentFetched: true,
      author: article.author ?? web.author,
      summary: article.summary || collapse(web.description ?? "", 400) || collapse(htmlToText(web.html), 400),
      readingMinutes: estimateReadingMinutes(plain || article.summary),
    }
    await store.replaceArticle(updated)
    return updated
  } catch (error) {
    const updated: Article = { ...article, contentFetched: true }
    await store.replaceArticle(updated)
    console.warn("[lume] 正文抓取失败", String(error))
    return updated
  }
}

/** 首页下拉刷新时的状态文案 */
export function refreshSummaryText(statuses: FeedRefreshStatus[]): string {
  if (!statuses.length) return ""
  const done = statuses.filter((s) => s.state === "done").length
  const failed = statuses.filter((s) => s.state === "failed").length
  if (failed === 0 && done === statuses.length) return "完成"
  if (done + failed < statuses.length) return "正在更新"
  return `完成 · ${failed} 个订阅源更新失败`
}
