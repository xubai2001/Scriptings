/**
 * Lume 的应用状态（模块级单例 + 订阅）。
 *
 * 设计要点：
 *  · Navigation.present 呈现的视图树拿不到 React Context，所以状态必须放在模块级单例里。
 *  · 文章列表在内存里只保留「轻量元数据」，正文块与原始 HTML 落在磁盘上按需读取，
 *    这样即使订阅了上百个 feed 也不会把内存撑爆。
 *  · 收藏 / 稍后阅读是独立快照（SavedArticle），RSS 后续更新不会影响已收藏的内容。
 */

import { useEffect, useState } from "scripting"
import type {
  AIProvider,
  Article,
  ContentBlock,
  Feed,
  FeedRefreshStatus,
  Folder,
  ReadState,
  SavedArticle,
  Settings,
  AISummary,
} from "../models"
import { defaultSettings, providerTemplate } from "../models"
import {
  ARTICLES_DIR,
  LUME_DIR,
  deletePath,
  ensureStorage,
  listDirectory,
  loadAPIKey,
  readJSON,
  saveAPIKey,
  writeJSON,
} from "./persist"
import { blocksToPlainText, extractBlocks, readerBlocks, PIPELINE_VERSION } from "./content"
import { collapse, estimateReadingMinutes, detectLanguage, hashString, htmlToText, uid } from "./utils"
import { normalizeFontSetting } from "./typography"

const FEEDS_FILE = LUME_DIR + "/feeds.json"
const FOLDERS_FILE = LUME_DIR + "/folders.json"
const SETTINGS_FILE = LUME_DIR + "/settings.json"
const PROVIDERS_FILE = LUME_DIR + "/providers.json"
const INDEX_FILE = LUME_DIR + "/index.json"
const SAVED_FILE = LUME_DIR + "/saved.json"

const MAX_ARTICLES_PER_FEED = 180

// ─────────────────────────────────────────────────────────────

export interface LightArticle extends Article {
  /** 只在内存里：正文是否已加载 */
  contentLoaded?: boolean
}

interface IndexFile {
  savedAt: number
  articles: LightArticle[]
}

/** 把完整文章压成列表用的轻量版本 */
export function toLight(article: Article): LightArticle {
  return { ...article, blocks: [], htmlContent: "" }
}

function articleFileName(feedID: string): string {
  return `${ARTICLES_DIR}/${feedID}.json`
}

export class LumeStore {
  feeds: Feed[] = []
  folders: Folder[] = []
  articles: LightArticle[] = []
  saved: SavedArticle[] = []
  settings: Settings = defaultSettings()
  providers: AIProvider[] = []
  refreshStatuses: FeedRefreshStatus[] = []
  refreshing = false
  loaded = false
  version = 0

  private listeners = new Set<() => void>()
  private fullCache = new Map<string, Article>()
  private feedArticleCache = new Map<string, Article[]>()
  private saveTimer: number | null = null

  // ── 订阅 ──────────────────────────────────────────────────

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  notify() {
    this.version++
    for (const listener of Array.from(this.listeners)) {
      try {
        listener()
      } catch (error) {
        console.warn("[lume] listener 出错", String(error))
      }
    }
  }

  // ── 启动加载 ──────────────────────────────────────────────

  async load(): Promise<void> {
    if (this.loaded) return
    await ensureStorage()
    const [feeds, folders, settings, providers, index, saved] = await Promise.all([
      readJSON<Feed[]>(FEEDS_FILE, []),
      readJSON<Folder[]>(FOLDERS_FILE, []),
      readJSON<Settings>(SETTINGS_FILE, defaultSettings()),
      readJSON<AIProvider[]>(PROVIDERS_FILE, []),
      readJSON<IndexFile>(INDEX_FILE, { savedAt: 0, articles: [] }),
      readJSON<SavedArticle[]>(SAVED_FILE, []),
    ])
    this.feeds = feeds.map((f) => ({ ...f }))
    this.folders = folders.slice().sort((a, b) => a.sortOrder - b.sortOrder)
    const merged = { ...defaultSettings(), ...settings }
    this.settings = {
      ...merged,
      // 旧数据没有这两个字段（或字段不完整），统一补齐
      titleFont: normalizeFontSetting(merged.titleFont),
      bodyFont: normalizeFontSetting(merged.bodyFont),
    }
    this.providers = providers.map((p) => ({ ...p, apiKey: p.apiKey || loadAPIKey(p.id) }))
    this.articles = (index.articles ?? []).map((a) => ({ ...a, blocks: [], htmlContent: "" }))
    this.saved = saved ?? []
    this.loaded = true
    this.recomputeUnread()
    this.notify()
    void this.pruneOrphanArticleFiles()
  }

  /** 删掉已经取消订阅的 feed 留下的文章文件（否则数据目录会一直变大） */
  private async pruneOrphanArticleFiles(): Promise<void> {
    try {
      const known = new Set(this.feeds.map((feed) => feed.id))
      const files = await listDirectory(ARTICLES_DIR)
      for (const file of files) {
        if (!file.endsWith(".json")) continue
        const feedID = file.slice(0, -5)
        if (!known.has(feedID)) await deletePath(`${ARTICLES_DIR}/${file}`)
      }
    } catch {
      // 清理失败不影响使用
    }
  }

  // ── 持久化 ────────────────────────────────────────────────

  scheduleSave() {
    if (this.saveTimer != null) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.flush()
    }, 350) as unknown as number
  }

  async flush(): Promise<void> {
    await Promise.all([
      writeJSON(FEEDS_FILE, this.feeds),
      writeJSON(FOLDERS_FILE, this.folders),
      writeJSON(SETTINGS_FILE, this.settings),
      writeJSON(PROVIDERS_FILE, this.providers.map((p) => ({ ...p, apiKey: "" }))),
      writeJSON(SAVED_FILE, this.saved),
      writeJSON(INDEX_FILE, { savedAt: Date.now(), articles: this.articles } as IndexFile),
    ])
  }

  /** 每个 feed 的完整文章落盘 */
  async saveFeedArticles(feedID: string, full: Article[]): Promise<void> {
    await ensureStorage()
    await writeJSON(articleFileName(feedID), full)
    this.feedArticleCache.set(feedID, full)
    for (const article of full) this.fullCache.set(article.id, article)

    const others = this.articles.filter((a) => a.feedID !== feedID)
    const light = full.map(toLight)
    this.articles = [...others, ...light]
    this.recomputeUnread()
    this.notify()
    this.scheduleSave()
  }

  /** 正文抓取完成后写回磁盘（会把该 feed 的完整文件重写一次） */
  async replaceArticle(article: Article): Promise<void> {
    this.fullCache.set(article.id, article)
    const light = toLight(article)
    const idx = this.articles.findIndex((a) => a.id === article.id)
    if (idx >= 0) this.articles[idx] = { ...this.articles[idx], ...light }
    else this.articles.push(light)

    const savedIndex = this.saved.findIndex((a) => a.id === article.id)
    if (savedIndex >= 0) this.saved[savedIndex] = { ...this.saved[savedIndex], ...article, savedAt: this.saved[savedIndex].savedAt }

    const feedList = await this.loadFeedArticles(article.feedID)
    const feedIndex = feedList.findIndex((a) => a.id === article.id)
    if (feedIndex >= 0) feedList[feedIndex] = article
    else feedList.push(article)
    await writeJSON(articleFileName(article.feedID), feedList)

    this.recomputeUnread()
    this.notify()
    this.scheduleSave()
  }

  // ── 查询 ──────────────────────────────────────────────────

  feedByID(id: string | undefined): Feed | undefined {
    if (!id) return undefined
    return this.feeds.find((f) => f.id === id)
  }

  folderByID(id: string | undefined): Folder | undefined {
    if (!id) return undefined
    return this.folders.find((f) => f.id === id)
  }

  articleByID(id: string): LightArticle | undefined {
    return this.articles.find((a) => a.id === id) ?? this.saved.find((a) => a.id === id)
  }

  savedArticleByID(id: string): SavedArticle | undefined {
    return this.saved.find((a) => a.id === id)
  }

  /** 读取完整文章（列表里只有轻量元数据） */
  async fullArticle(id: string): Promise<Article | undefined> {
    const cached = this.fullCache.get(id)
    if (cached) return this.reextractIfStale(cached)

    const savedFull = this.saved.find((a) => a.id === id)
    if (savedFull) {
      const upgraded = await this.reextractIfStale(savedFull)
      this.fullCache.set(id, upgraded)
      return upgraded
    }

    const light = this.articles.find((a) => a.id === id)
    if (!light) return undefined

    const full = await this.loadFeedArticles(light.feedID)
    const found = full.find((a) => a.id === id)
    if (!found) return undefined
    const upgraded = await this.reextractIfStale(found)
    this.fullCache.set(id, upgraded)
    return upgraded
  }

  /**
   * 解析规则升级后（见 content.ts 的 PIPELINE_VERSION），用本地已存的 HTML
   * 重新解析一次块（不需要联网）。不重解析的话，旧文章打开时看不到新规则的效果。
   */
  private async reextractIfStale(article: Article): Promise<Article> {
    if (article.pipelineVersion === PIPELINE_VERSION || !article.htmlContent) return article
    try {
      const extracted = extractBlocks(article.htmlContent, { baseURL: article.url, title: article.title })
      if (!extracted.blocks.length) return article
      const images = [...article.images, ...extracted.images].filter(
        (media, index, list) => list.findIndex((m) => m.url === media.url) === index
      )
      const rebuilt: Article = { ...article, blocks: extracted.blocks, images, pipelineVersion: PIPELINE_VERSION }
      this.fullCache.set(rebuilt.id, rebuilt)
      const savedIndex = this.saved.findIndex((a) => a.id === rebuilt.id)
      if (savedIndex >= 0) this.saved[savedIndex] = { ...this.saved[savedIndex], ...rebuilt }
      const lightIndex = this.articles.findIndex((a) => a.id === rebuilt.id)
      if (lightIndex >= 0) this.articles[lightIndex] = { ...this.articles[lightIndex], ...toLight(rebuilt) }
      this.scheduleSave()
      return rebuilt
    } catch {
      return article
    }
  }

  async loadFeedArticles(feedID: string): Promise<Article[]> {
    const cached = this.feedArticleCache.get(feedID)
    if (cached) return cached
    const list = await readJSON<Article[]>(articleFileName(feedID), [])
    const normalized = list.map((a) => ({ ...a, blocks: a.blocks ?? [] }))
    this.feedArticleCache.set(feedID, normalized)
    return normalized
  }

  /** 内存里释放掉某个 feed 的正文缓存（清理缓存时用） */
  dropCaches() {
    this.fullCache.clear()
    this.feedArticleCache.clear()
  }

  sortedArticles(): LightArticle[] {
    return this.articles.slice().sort((a, b) => b.publishedAt - a.publishedAt)
  }

  unreadCount(feedID?: string): number {
    if (feedID) return this.articles.filter((a) => a.feedID === feedID && a.state !== "read").length
    return this.articles.filter((a) => a.state !== "read").length
  }

  favoriteArticles(): SavedArticle[] {
    return this.saved.filter((a) => a.isFavorite).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
  }

  laterArticles(): SavedArticle[] {
    return this.saved.filter((a) => a.isLater).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
  }

  // ── Feed 管理 ─────────────────────────────────────────────

  addFeedData(feed: Feed): Feed {
    const existing = this.feeds.find((f) => f.url === feed.url || f.id === feed.id)
    if (existing) return existing
    this.feeds.push(feed)
    this.notify()
    this.scheduleSave()
    return feed
  }

  updateFeed(feedID: string, patch: Partial<Feed>) {
    const feed = this.feedByID(feedID)
    if (!feed) return
    Object.assign(feed, patch)
    this.notify()
    this.scheduleSave()
  }

  async removeFeed(feedID: string) {
    this.feeds = this.feeds.filter((f) => f.id !== feedID)
    this.articles = this.articles.filter((a) => a.feedID !== feedID)
    this.feedArticleCache.delete(feedID)
    try {
      await deletePath(articleFileName(feedID))
    } catch {
      // 忽略
    }
    this.notify()
    this.scheduleSave()
  }

  addFolder(name: string): Folder {
    const folder: Folder = { id: uid("folder-"), name: name.trim() || "未命名", sortOrder: this.folders.length }
    this.folders.push(folder)
    this.notify()
    this.scheduleSave()
    return folder
  }

  renameFolder(folderID: string, name: string) {
    const folder = this.folderByID(folderID)
    if (!folder) return
    folder.name = name.trim() || folder.name
    this.notify()
    this.scheduleSave()
  }

  removeFolder(folderID: string) {
    this.folders = this.folders.filter((f) => f.id !== folderID)
    for (const feed of this.feeds) if (feed.folderID === folderID) feed.folderID = undefined
    this.notify()
    this.scheduleSave()
  }

  moveFeedToFolder(feedID: string, folderID: string | undefined) {
    const feed = this.feedByID(feedID)
    if (!feed) return
    feed.folderID = folderID
    this.notify()
    this.scheduleSave()
  }

  // ── 阅读状态 ──────────────────────────────────────────────

  private patchArticle(id: string, patch: Partial<Article>) {
    const light = this.articles.find((a) => a.id === id)
    if (light) Object.assign(light, patch)
    const saved = this.saved.find((a) => a.id === id)
    if (saved) Object.assign(saved, patch)
    const cached = this.fullCache.get(id)
    if (cached) Object.assign(cached, patch)
    const feedCache = this.feedArticleCache.get(patch.feedID ?? light?.feedID ?? "")
    if (feedCache) {
      const hit = feedCache.find((a) => a.id === id)
      if (hit) Object.assign(hit, patch)
    }
  }

  setReadState(id: string, state: ReadState) {
    const article = this.articleByID(id)
    this.patchArticle(id, { state })
    if (state === "read") {
      // 读完的稍后阅读条目自动移出队列
      const saved = this.saved.find((a) => a.id === id)
      if (saved && saved.isLater && !saved.isFavorite) {
        saved.isLater = false
        this.saved = this.saved.filter((a) => a.isFavorite || a.isLater)
      } else if (saved && saved.isLater) {
        saved.isLater = false
      }
    }
    if (article) this.recomputeUnread()
    this.notify()
    this.scheduleSave()
  }

  toggleFavorite(id: string): boolean {
    const saved = this.saved.find((a) => a.id === id)
    if (saved) {
      const next = !saved.isFavorite
      saved.isFavorite = next
      this.patchArticle(id, { isFavorite: next })
      if (!saved.isFavorite && !saved.isLater) {
        this.saved = this.saved.filter((a) => a.id !== id)
      }
      this.notify()
      this.scheduleSave()
      return next
    }
    // 从列表快照一份
    const light = this.articleByID(id)
    if (!light) return false
    const snapshot: SavedArticle = {
      ...(light as Article),
      isFavorite: true,
      savedAt: Date.now(),
      feedTitle: this.feedByID(light.feedID)?.title ?? "",
      feedIconURL: this.feedByID(light.feedID)?.iconURL,
      feedSiteURL: this.feedByID(light.feedID)?.siteURL ?? "",
    }
    this.saved.push(snapshot)
    this.patchArticle(id, { isFavorite: true })
    this.notify()
    this.scheduleSave()
    return true
  }

  toggleLater(id: string): boolean {
    const saved = this.saved.find((a) => a.id === id)
    if (saved) {
      const next = !saved.isLater
      saved.isLater = next
      this.patchArticle(id, { isLater: next })
      if (!saved.isFavorite && !saved.isLater) this.saved = this.saved.filter((a) => a.id !== id)
      this.notify()
      this.scheduleSave()
      return next
    }
    const light = this.articleByID(id)
    if (!light) return false
    const snapshot: SavedArticle = {
      ...(light as Article),
      isLater: true,
      savedAt: Date.now(),
      feedTitle: this.feedByID(light.feedID)?.title ?? "",
      feedIconURL: this.feedByID(light.feedID)?.iconURL,
      feedSiteURL: this.feedByID(light.feedID)?.siteURL ?? "",
    }
    this.saved.push(snapshot)
    this.patchArticle(id, { isLater: true })
    this.notify()
    this.scheduleSave()
    return true
  }

  removeSaved(id: string) {
    this.saved = this.saved.filter((a) => a.id !== id)
    this.patchArticle(id, { isFavorite: false, isLater: false })
    this.notify()
    this.scheduleSave()
  }

  setProgress(id: string, percent: number, blockID?: string) {
    const article = this.articleByID(id)
    if (!article) return
    const previous = article.progress?.percent ?? 0
    const next = Math.max(previous, percent)
    // 滚动过程中会频繁回调：进度变化不足 1% 就不触发重渲染
    if (next < previous + 0.01) return
    this.patchArticle(id, { progress: { percent: next, blockID: blockID ?? article.progress?.blockID, updatedAt: Date.now() } })
    if (article.state === "unread") this.patchArticle(id, { state: "reading" })
    const settings = this.settings
    if (
      settings.markReadMode === "progress" &&
      next >= settings.markReadThreshold / 100 &&
      article.state !== "read"
    ) {
      this.setReadState(id, "read")
      return
    }
    this.notify()
    this.scheduleSave()
  }

  markAllRead(feedID?: string) {
    for (const article of this.articles) {
      if (feedID && article.feedID !== feedID) continue
      article.state = "read"
    }
    for (const saved of this.saved) {
      if (feedID && saved.feedID !== feedID) continue
      if (saved.isLater && !saved.isFavorite) saved.isLater = false
    }
    this.saved = this.saved.filter((a) => a.isFavorite || a.isLater)
    this.recomputeUnread()
    this.notify()
    this.scheduleSave()
  }

  setAISummary(id: string, summary: AISummary | undefined) {
    this.patchArticle(id, { aiSummary: summary })
    this.notify()
    this.scheduleSave()
  }

  // ── 设置 / Provider ───────────────────────────────────────

  updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch }
    this.notify()
    this.scheduleSave()
  }

  upsertProvider(provider: AIProvider) {
    const index = this.providers.findIndex((p) => p.id === provider.id)
    if (index >= 0) this.providers[index] = provider
    else this.providers.push(provider)
    saveAPIKey(provider.id, provider.apiKey)
    if (!this.settings.activeProviderID && provider.apiKey) {
      this.settings.activeProviderID = provider.id
      this.settings.defaultModel = provider.model
    }
    this.notify()
    this.scheduleSave()
  }

  removeProvider(id: string) {
    this.providers = this.providers.filter((p) => p.id !== id)
    saveAPIKey(id, "")
    if (this.settings.activeProviderID === id) {
      this.settings.activeProviderID = this.providers[0]?.id
      this.settings.defaultModel = this.providers[0]?.model ?? ""
    }
    this.notify()
    this.scheduleSave()
  }

  activeProvider(): AIProvider | undefined {
    const id = this.settings.activeProviderID
    const found = id ? this.providers.find((p) => p.id === id) : undefined
    if (found) return found
    return this.providers.find((p) => p.apiKey && p.enabled) ?? this.providers.find((p) => p.apiKey)
  }

  hasAIConfigured(): boolean {
    const provider = this.activeProvider()
    return !!provider && !!provider.apiKey
  }

  /** 首次配置 AI 时的隐私提示 */
  get privacyAcknowledged(): boolean {
    return Storage.get<boolean>("lume.ai.privacy.ack") === true
  }

  acknowledgePrivacy() {
    Storage.set("lume.ai.privacy.ack", true)
    this.notify()
  }

  // ── 刷新状态 ──────────────────────────────────────────────

  setRefreshStatuses(statuses: FeedRefreshStatus[]) {
    this.refreshStatuses = statuses
    this.notify()
  }

  updateRefreshStatus(feedID: string, patch: Partial<FeedRefreshStatus>) {
    const entry = this.refreshStatuses.find((s) => s.feedID === feedID)
    if (entry) Object.assign(entry, patch)
    else
      this.refreshStatuses.push({
        feedID,
        title: this.feedByID(feedID)?.title ?? "",
        state: "queued",
        newCount: 0,
        ...patch,
      })
    this.notify()
  }

  setRefreshing(value: boolean) {
    this.refreshing = value
    this.notify()
  }

  // ── 搜索 ──────────────────────────────────────────────────

  search(query: string, scope: "all" | "feeds" | "favorites" | "later" = "all"): LightArticle[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const pool: LightArticle[] =
      scope === "favorites" ? this.favoriteArticles() : scope === "later" ? this.laterArticles() : this.articles
    const results: LightArticle[] = []
    for (const article of pool) {
      const feed = this.feedByID(article.feedID)
      const haystack = [
        article.title,
        article.author ?? "",
        feed?.title ?? "",
        article.summary,
        article.categories.join(" "),
      ]
        .join(" ")
        .toLowerCase()
      if (haystack.includes(q)) {
        results.push(article)
        continue
      }
      // 正文里也搜（需要拉磁盘上的正文）
      const cached = this.fullCache.get(article.id)
      if (cached) {
        const text = cached.blocks
          .map((b) => (b.kind === "paragraph" || b.kind === "heading" ? b.text : b.kind === "quote" ? b.text : ""))
          .join(" ")
          .toLowerCase()
        if (text.includes(q)) results.push(article)
      }
    }
    return results.sort((a, b) => b.publishedAt - a.publishedAt)
  }

  // ── 内部 ──────────────────────────────────────────────────

  private recomputeUnread() {
    const counts = new Map<string, number>()
    for (const article of this.articles) {
      if (article.state === "read") continue
      counts.set(article.feedID, (counts.get(article.feedID) ?? 0) + 1)
    }
    for (const feed of this.feeds) feed.unreadCount = counts.get(feed.id) ?? 0
  }

  /** 新建文章对象（来自解析结果） */
  buildArticle(input: {
    feedID: string
    dedupeKey: string
    title: string
    url: string
    author?: string
    publishedAt: number
    updatedAt: number
    summary: string
    htmlContent: string
    images: Article["images"]
    categories: string[]
    existing?: Article
  }): Article {
    const id = "a-" + hashString(`${input.feedID}|${input.dedupeKey}`)
    const existing = input.existing
    const baseHTML = input.htmlContent || ""

    // 正文没变、且解析规则没升级时，直接复用已解析的块（刷新的热路径）
    if (
      existing &&
      existing.htmlContent === baseHTML &&
      existing.blocks.length > 0 &&
      existing.pipelineVersion === PIPELINE_VERSION
    ) {
      return {
        ...existing,
        title: input.title || existing.title,
        url: input.url || existing.url,
        author: input.author ?? existing.author,
        publishedAt: input.publishedAt || existing.publishedAt,
        updatedAt: input.updatedAt || existing.updatedAt,
        summary: input.summary || existing.summary,
        categories: input.categories?.length ? input.categories : existing.categories,
        images: input.images?.length ? input.images : existing.images,
      }
    }
    const extracted = baseHTML
      ? extractBlocks(baseHTML, { baseURL: input.url, title: input.title })
      : { blocks: [] as ContentBlock[], images: [], textLength: 0 }
    // ⚠️ 存**全部**块（包括 noise）：阅读模式和原文模式的差别就靠它。
    // 只存过滤后的块 → 原文模式永远和阅读模式一样（曾经的 bug）。
    let blocks = extracted.blocks
    const readable = readerBlocks(extracted.blocks)
    if (!readable.length && input.summary) {
      blocks = [{ kind: "paragraph", id: uid("b-"), text: input.summary, noise: false }]
    }
    const images = [...input.images, ...extracted.images].filter(
      (media, index, list) => list.findIndex((m) => m.url === media.url) === index
    )
    // 正文长度按过滤后的内容算（噪声不算阅读量）
    const plain = blocksToPlainText(readable.length ? readable : blocks)
    const textLength = plain.length
    const contentSource: Article["contentSource"] =
      textLength > 900 || extracted.textLength > 900 ? "feed-full" : baseHTML || input.summary ? "feed-summary" : "none"

    return {
      id,
      feedID: input.feedID,
      dedupeKey: input.dedupeKey,
      title: input.title,
      author: input.author ?? existing?.author,
      url: input.url,
      publishedAt: input.publishedAt || existing?.publishedAt || Date.now(),
      updatedAt: input.updatedAt || existing?.updatedAt || Date.now(),
      summary: input.summary || existing?.summary || collapse(htmlToText(input.htmlContent), 400),
      blocks,
      htmlContent: baseHTML,
      images,
      categories: input.categories?.length ? input.categories : (existing?.categories ?? []),
      state: existing?.state ?? "unread",
      isFavorite: existing?.isFavorite ?? false,
      isLater: existing?.isLater ?? false,
      progress: existing?.progress ?? { percent: 0, updatedAt: 0 },
      createdAt: existing?.createdAt ?? Date.now(),
      contentSource,
      contentFetched: existing?.contentFetched ?? false,
      aiSummary: existing?.aiSummary,
      readingMinutes: estimateReadingMinutes(plain || input.summary || input.title),
      language: detectLanguage(input.title + " " + (plain || input.summary)),
      pipelineVersion: PIPELINE_VERSION,
    }
  }

  trimArticles(feedID: string, list: Article[]): Article[] {
    const sorted = list.slice().sort((a, b) => b.publishedAt - a.publishedAt)
    const kept: Article[] = []
    const overflow: Article[] = []
    for (const article of sorted) {
      if (kept.length < MAX_ARTICLES_PER_FEED) kept.push(article)
      else overflow.push(article)
    }
    for (const article of overflow) {
      if (article.isFavorite || article.isLater) kept.push(article)
    }
    return kept
  }
}

export const store = new LumeStore()

// ─────────────────────────────────────────────────────────────
// React 绑定
// ─────────────────────────────────────────────────────────────

/** 订阅 store 变化，返回当前版本号（用于强制重渲染） */
export function useStoreVersion(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const unsubscribe = store.subscribe(() => setVersion((v) => v + 1))
    return () => unsubscribe()
  }, [])
  return version
}

export function ensureProvidersSeeded() {
  if (store.providers.length) return
  store.providers = [providerTemplate("deepseek"), providerTemplate("openai"), providerTemplate("custom")]
  store.scheduleSave()
}
