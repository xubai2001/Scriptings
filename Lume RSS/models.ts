/**
 * Lume RSS — 核心数据模型
 *
 * 设计原则：所有持久化对象都是纯 JSON 可序列化的普通对象，
 * 便于写入文件 / 从文件恢复，也便于 AI 层做结构化输出。
 */

// ─────────────────────────────────────────────────────────────
// 媒体
// ─────────────────────────────────────────────────────────────

export type MediaKind = "image" | "gif" | "video" | "audio"

export type MediaSource =
  | "media:content"
  | "media:thumbnail"
  | "enclosure"
  | "atom"
  | "description"
  | "content"
  | "og:image"
  | "web"

export interface ArticleMedia {
  id: string
  type: MediaKind
  url: string
  width?: number
  height?: number
  alt?: string
  caption?: string
  source: MediaSource
}

// ─────────────────────────────────────────────────────────────
// 正文块（独立媒体解析层的产物，UI 只负责渲染）
// ─────────────────────────────────────────────────────────────

export type ContentBlock =
  | { kind: "paragraph"; id: string; text: string; noise: boolean }
  | { kind: "heading"; id: string; level: number; text: string; noise: boolean }
  | { kind: "image"; id: string; media: ArticleMedia; noise: boolean }
  | { kind: "video"; id: string; media: ArticleMedia; noise: boolean }
  | { kind: "quote"; id: string; text: string; cite?: string; noise: boolean }
  | { kind: "code"; id: string; text: string; language?: string; noise: boolean }
  | { kind: "list"; id: string; ordered: boolean; items: string[]; noise: boolean }
  | { kind: "table"; id: string; rows: string[][]; noise: boolean }
  | { kind: "divider"; id: string; noise: boolean }

export type ContentSource = "feed-full" | "feed-summary" | "web" | "none"

// ─────────────────────────────────────────────────────────────
// AI 摘要
// ─────────────────────────────────────────────────────────────

export interface AISummary {
  /** 一句话总结 */
  oneLine: string
  /** 核心内容 3–5 条 */
  points: string[]
  /** 关键数据 / 值得注意的事实 */
  data: string[]
  /** 文章本身存在的结论（没有则为空） */
  conclusion?: string
  /** 生成它的 provider / model，便于展示与失效判断 */
  providerID: string
  providerName: string
  model: string
  createdAt: number
  /** 长文分段时记录的分段数（1 = 未分段） */
  chunks: number
  /** 摘要期间文章正文的指纹，正文变了可以提示重新生成 */
  contentHash: string
}

// ─────────────────────────────────────────────────────────────
// 文章
// ─────────────────────────────────────────────────────────────

export type ReadState = "unread" | "reading" | "read"

export interface ReadingProgress {
  /** 0–1 */
  percent: number
  /** 上次阅读所在的正文块 id */
  blockID?: string
  updatedAt: number
}

export interface Article {
  id: string
  feedID: string
  /** 去重用的稳定标识（guid / canonical url / title+date 哈希） */
  dedupeKey: string
  title: string
  author?: string
  url: string
  publishedAt: number
  updatedAt: number
  /** 列表摘要（纯文本） */
  summary: string
  /** 已提取的正文块。为空表示还没做正文解析。 */
  blocks: ContentBlock[]
  /** RSS 原始 HTML（正文原文模式、渲染回退用） */
  htmlContent: string
  /** 媒体层结果，按优先级排序 */
  images: ArticleMedia[]
  categories: string[]
  state: ReadState
  isFavorite: boolean
  isLater: boolean
  progress: ReadingProgress
  createdAt: number
  /** 正文从哪里来的 */
  contentSource: ContentSource
  /** 是否已经尝试过抓取原网页（避免反复请求） */
  contentFetched: boolean
  /** AI 摘要缓存 */
  aiSummary?: AISummary
  /** 阅读时长（分钟） */
  readingMinutes: number
  /** 原文语言（AI prompt 用，启发式判断） */
  language?: string
  /**
   * 解析管道版本（content.ts 的 PIPELINE_VERSION）。
   * 旧文章少了这个字段 → 打开时用新规则重解析一次，否则看不到噪声识别的新结果。
   */
  pipelineVersion?: number
}

/** 收藏用的独立快照：RSS 后续更新不影响它 */
export interface SavedArticle extends Article {
  savedAt: number
  feedTitle: string
  feedIconURL?: string
  feedSiteURL: string
}

// ─────────────────────────────────────────────────────────────
// 订阅源
// ─────────────────────────────────────────────────────────────

export interface Feed {
  id: string
  title: string
  /** feed 地址 */
  url: string
  /** 网站地址 */
  siteURL: string
  description: string
  iconURL?: string
  folderID?: string
  lastUpdated?: number
  /** 上次成功更新时间 */
  lastSuccessAt?: number
  unreadCount: number
  isMuted: boolean
  /** 上次刷新错误的友好文案 */
  lastError?: string
  lastErrorAt?: number
  /** 排序权重 */
  sortOrder: number
  /** feed 类型，仅展示用 */
  feedType?: "rss" | "atom" | "json"
  /** 最近一次刷新新增文章数 */
  lastNewCount?: number
}

export interface Folder {
  id: string
  name: string
  sortOrder: number
}

// ─────────────────────────────────────────────────────────────
// AI Provider
// ─────────────────────────────────────────────────────────────

export type AIProviderType = "deepseek" | "openai" | "custom"

export interface AIProvider {
  id: string
  name: string
  type: AIProviderType
  baseURL: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  enabled: boolean
}

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
export const OPENAI_BASE_URL = "https://api.openai.com/v1"

export const DEEPSEEK_MODELS = ["deepseek-chat", "deepseek-reasoner"]

export function providerTemplate(type: AIProviderType): AIProvider {
  const base = type === "deepseek" ? DEEPSEEK_BASE_URL : type === "openai" ? OPENAI_BASE_URL : ""
  return {
    id: type,
    name: type === "deepseek" ? "DeepSeek" : type === "openai" ? "OpenAI" : "自定义",
    type,
    baseURL: base,
    apiKey: "",
    model: type === "deepseek" ? "deepseek-chat" : "",
    temperature: 0.3,
    maxTokens: 800,
    enabled: true,
  }
}

// ─────────────────────────────────────────────────────────────
// 设置
// ─────────────────────────────────────────────────────────────

export type SummaryLength = "short" | "medium" | "long"
export type AutoSummaryMode = "off" | "favorite" | "read" | "wifi"
export type SummaryLanguage = "auto" | "zh" | "en"
export type AppearanceMode = "system" | "light" | "dark"
export type ReadMarkMode = "open" | "progress"
export type ImageCacheLimit = 0 | 500 | 1024 | 2048 | -1 // 0=自动, -1=不限制 (MB)
export type RefreshInterval = "manual" | "30m" | "1h" | "3h" | "6h"
/** 系统内置的字体变体（一定存在，不会回退） */
export type FontDesignOption = "default" | "monospaced" | "rounded" | "serif"

/**
 * 字体选择：family 为空时用系统字体（可选 design 变体），
 * 非空时用自定义字体族（PostScript / family 名，如 PingFangSC-Regular）。
 */
export interface FontSetting {
  design: FontDesignOption
  family: string
}

export interface Settings {
  // 阅读
  readingMode: "reader" | "original"
  fontSize: number
  lineSpacing: number
  articleMaxWidth: number
  markReadMode: ReadMarkMode
  markReadThreshold: number
  showReadingProgress: boolean
  // AI
  activeProviderID?: string
  defaultModel: string
  summaryLength: SummaryLength
  autoSummary: AutoSummaryMode
  summaryLanguage: SummaryLanguage
  maxArticleTokens: number
  enableChunking: boolean
  cacheSummary: boolean
  // 订阅
  refreshInterval: RefreshInterval
  fetchFullContent: boolean
  // 缓存
  imageCacheLimit: ImageCacheLimit
  offlineReading: boolean
  // 外观
  appearance: AppearanceMode
  /** 文章标题（含正文里的小标题、列表里的标题）字体 */
  titleFont: FontSetting
  /** 正文字体 */
  bodyFont: FontSetting
}

export function defaultSettings(): Settings {
  return {
    readingMode: "reader",
    fontSize: 17,
    lineSpacing: 1.55,
    articleMaxWidth: 680,
    markReadMode: "progress",
    markReadThreshold: 70,
    showReadingProgress: true,
    activeProviderID: undefined,
    defaultModel: "",
    summaryLength: "medium",
    autoSummary: "off",
    summaryLanguage: "auto",
    maxArticleTokens: 6000,
    enableChunking: true,
    cacheSummary: true,
    refreshInterval: "manual",
    fetchFullContent: true,
    imageCacheLimit: 0,
    offlineReading: true,
    appearance: "system",
    titleFont: { design: "default", family: "" },
    bodyFont: { design: "default", family: "" },
  }
}

// ─────────────────────────────────────────────────────────────
// 刷新状态
// ─────────────────────────────────────────────────────────────

export type FeedRefreshState = "queued" | "refreshing" | "done" | "failed"

export interface FeedRefreshStatus {
  feedID: string
  title: string
  state: FeedRefreshState
  newCount: number
  error?: string
}
