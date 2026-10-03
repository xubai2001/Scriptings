/**
 * AI 层：统一的 Provider 抽象 + 分段摘要（Map → Reduce）。
 *
 * 支持 OpenAI / DeepSeek / 任意 OpenAI Compatible 服务。
 * 失败一律转换为人类可读的说明，绝不把 "Error 500" 这种开发者信息丢给用户。
 */

import { fetch } from "scripting"
import type { AISummary, AIProvider, Article, ContentBlock, SummaryLanguage, SummaryLength } from "../models"
import { blocksToPlainText } from "./content"
import { estimateTokens, hashString } from "./utils"

// ── 错误 ─────────────────────────────────────────────────────

export class AISummaryError extends Error {
  title: string
  reasons: string[]
  detail?: string
  constructor(title: string, reasons: string[], detail?: string) {
    super(title)
    this.title = title
    this.reasons = reasons
    this.detail = detail
  }
}

function friendlyError(status: number): AISummaryError {
  if (status === 401 || status === 403) {
    return new AISummaryError("AI 总结失败", ["API Key 无效或已过期", "请检查设置中的 API Key"], `HTTP ${status}`)
  }
  if (status === 404) {
    return new AISummaryError("AI 总结失败", ["模型名或服务地址不正确", "请检查 Base URL 与模型"], `HTTP ${status}`)
  }
  if (status === 429) {
    return new AISummaryError("AI 总结失败", ["请求过于频繁或额度不足", "请稍后重试，或检查账户余额"], `HTTP ${status}`)
  }
  if (status >= 500) {
    return new AISummaryError("AI 总结失败", ["AI 服务暂时不可用", "请稍后重试"], `HTTP ${status}`)
  }
  return new AISummaryError("AI 总结失败", ["请求被 AI 服务拒绝", "请检查设置"], `HTTP ${status}`)
}

// ── 请求 ─────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export function endpointFor(provider: AIProvider): string {
  const base = (provider.baseURL || "").replace(/\/+$/, "")
  if (!base) return ""
  if (/\/chat\/completions$/i.test(base)) return base
  return base + "/chat/completions"
}

export interface ChatOptions {
  temperature?: number
  maxTokens?: number
  timeout?: number
  json?: boolean
}

export async function chatCompletion(
  provider: AIProvider,
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<{ content: string; latency: number; model: string }> {
  const url = endpointFor(provider)
  if (!url) {
    throw new AISummaryError("AI 总结失败", ["还没有填写服务地址（Base URL）", "请在设置中配置 AI 服务"])
  }
  if (!provider.apiKey) {
    throw new AISummaryError("AI 总结失败", ["还没有填写 API Key", "请在设置中配置 AI 服务"])
  }

  const timeout = options.timeout ?? 90000
  const started = Date.now()
  let timer: unknown = null

  const body: Record<string, unknown> = {
    model: provider.model,
    messages,
    temperature: options.temperature ?? provider.temperature ?? 0.3,
    stream: false,
  }
  if (options.maxTokens) body.max_tokens = options.maxTokens
  if (options.json && provider.type !== "deepseek") {
    body.response_format = { type: "json_object" }
  } else if (options.json) {
    body.response_format = { type: "json_object" }
  }

  try {
    const response = await Promise.race([
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(body),
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AISummaryError("AI 总结失败", ["请求超时", "网络不稳定或文章过长"], "timeout")), timeout)
      }),
    ])

    if (!response.ok) throw friendlyError(response.status)
    const text = await response.text()
    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      throw new AISummaryError("AI 总结失败", ["AI 服务返回了无法解析的内容", "请检查 Base URL 是否正确"], text.slice(0, 120))
    }
    const content: string =
      data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? ""
    if (!content || !String(content).trim()) {
      throw new AISummaryError("AI 总结失败", ["AI 服务返回了空内容", "请稍后重试"], JSON.stringify(data).slice(0, 120))
    }
    return { content: String(content), latency: Date.now() - started, model: data?.model ?? provider.model }
  } catch (error) {
    if (error instanceof AISummaryError) throw error
    throw new AISummaryError(
      "AI 总结失败",
      ["无法连接到 AI 服务", "网络连接失败，或服务地址不可达"],
      String((error as Error)?.message ?? error)
    )
  } finally {
    if (timer != null) clearTimeout(timer as number)
  }
}

// ── 测试连接 ─────────────────────────────────────────────────

export interface ProviderTestResult {
  ok: boolean
  latency?: number
  model?: string
  message: string
  detail?: string
}

export async function testProvider(provider: AIProvider): Promise<ProviderTestResult> {
  try {
    const result = await chatCompletion(
      provider,
      [
        { role: "system", content: "You are a connection test. Reply with the single word: ok" },
        { role: "user", content: "ping" },
      ],
      { maxTokens: 160, temperature: 0, timeout: 25000 }
    )
    return { ok: true, latency: result.latency, model: result.model, message: "连接成功" }
  } catch (error) {
    if (error instanceof AISummaryError) {
      return { ok: false, message: error.title, detail: error.detail }
    }
    return { ok: false, message: "连接失败", detail: String((error as Error)?.message ?? error) }
  }
}

// ── Prompt ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是一名专业的文章摘要助手。
请严格根据提供的文章内容进行总结，不得添加文章中不存在的事实。
输出：
1. 一句话总结
2. 3-5 条核心观点
3. 文章中值得注意的数据或事实
如果文章没有明确结论，不要自行推断结论。
保持简洁。`

const CHUNK_SYSTEM_PROMPT = `你是一名文章阅读助手。下面是一篇长文章的一个片段。
请只提取这个片段中真实存在的信息，不要补充片段之外的任何内容，不要下结论。
用简洁的要点列出：核心事实、关键数据、重要观点。`

function lengthInstruction(length: SummaryLength, language: SummaryLanguage): string {
  const points = length === "short" ? 3 : length === "medium" ? 4 : 5
  const sentence = length === "short" ? "一句话总结不超过 40 字" : length === "medium" ? "一句话总结 40–80 字" : "一句话总结 80–120 字"
  const lang =
    language === "zh"
      ? "使用简体中文输出。"
      : language === "en"
        ? "Output in English."
        : "使用与文章正文相同的语言输出。"
  return `${sentence}。核心内容 ${points} 条，每条不超过 40 字。${lang}`
}

function jsonInstruction(): string {
  return `只输出 JSON，不要输出任何其他文字、不要使用 markdown 代码块。格式：
{"oneLine":"一句话总结","points":["核心观点1","核心观点2"],"data":["关键数据或事实1"],"conclusion":"文章明确给出的结论，如果没有就省略这个字段"}`
}

function plainTextOfArticle(article: Article, limit = 12000): string {
  const text = blocksToPlainText(article.blocks) || article.summary || ""
  if (text.length <= limit) return text
  return text.slice(0, limit)
}

function renderFinalUserPrompt(article: Article, body: string, length: SummaryLength, language: SummaryLanguage): string {
  const parts = [`标题：${article.title}`]
  if (article.author) parts.push(`作者：${article.author}`)
  if (article.url) parts.push(`来源：${article.url}`)
  parts.push(`正文：\n${body}`)
  return `${parts.join("\n")}\n\n${lengthInstruction(length, language)}\n${jsonInstruction()}`
}

// ── 输出解析 ─────────────────────────────────────────────────

export interface ParsedSummary {
  oneLine: string
  points: string[]
  data: string[]
  conclusion?: string
}

function stripFences(raw: string): string {
  let text = raw.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(text)
  if (fence) text = fence[1].trim()
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start >= 0 && end > start) text = text.slice(start, end + 1)
  return text
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim()
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>
        return String(obj.text ?? obj.point ?? obj.title ?? obj.value ?? "").trim()
      }
      return ""
    })
    .filter((item) => !!item)
}

/** 宽容解析：JSON 优先，失败则退化到纯文本启发式 */
export function parseSummaryOutput(raw: string): ParsedSummary {
  const cleaned = stripFences(raw)
  try {
    const data = JSON.parse(cleaned)
    const oneLine = String(data.oneLine ?? data.oneline ?? data.summary ?? data["一句话总结"] ?? "").trim()
    const points = asStringArray(data.points ?? data.keyPoints ?? data["核心内容"] ?? data["核心观点"])
    const facts = asStringArray(data.data ?? data.facts ?? data["关键数据"] ?? data["值得注意"])
    const conclusionRaw = data.conclusion ?? data["结论"]
    const conclusion = typeof conclusionRaw === "string" && conclusionRaw.trim() ? conclusionRaw.trim() : undefined
    if (oneLine || points.length) {
      return { oneLine: oneLine || points[0] || "", points: oneLine ? points : points.slice(1), data: facts, conclusion }
    }
  } catch {
    // 退化到文本解析
  }

  const lines = raw
    .split("\n")
    .map((line) => line.replace(/^[\s>*•\-\d.、)]+/, "").trim())
    .filter((line) => !!line)
  const oneLine = lines[0] ?? ""
  const points = lines.slice(1, 6)
  return { oneLine, points, data: [] }
}

// ── 摘要主流程 ───────────────────────────────────────────────

export interface SummarizeOptions {
  provider: AIProvider
  length: SummaryLength
  language: SummaryLanguage
  maxArticleTokens: number
  enableChunking: boolean
  onProgress?: (stage: string, progress: number) => void
}

/** Map → Reduce：长文章先分段摘要，再合并成最终摘要 */
export async function summarizeArticle(article: Article, options: SummarizeOptions): Promise<AISummary> {
  const { provider } = options
  const blocks = article.blocks.length
    ? article.blocks
    : ([{ kind: "paragraph", id: "synthetic", text: article.summary, noise: false }] as ContentBlock[])

  const bodyText = blocksToPlainText(blocks)
  const tokens = estimateTokens(bodyText)
  const limit = Math.max(800, options.maxArticleTokens || 6000)

  let finalBody = bodyText.slice(0, 12000)
  let chunkCount = 1

  if (options.enableChunking && tokens > limit) {
    const groups = splitBlocksByTokens(blocks, limit * 0.8)
    chunkCount = groups.length
    const partials: string[] = []
    for (let i = 0; i < groups.length; i++) {
      options.onProgress?.(`正在阅读第 ${i + 1} / ${groups.length} 段…`, (i + 1) / (groups.length + 1))
      const chunkText = blocksToPlainText(groups[i])
      const result = await chatCompletion(
        provider,
        [
          { role: "system", content: CHUNK_SYSTEM_PROMPT },
          { role: "user", content: `标题：${article.title}\n\n片段 ${i + 1}/${groups.length}：\n${chunkText}` },
        ],
        { maxTokens: Math.max(400, Math.min(900, provider.maxTokens || 800)), temperature: 0.2 }
      )
      partials.push(result.content.trim())
    }
    finalBody = partials.map((p, i) => `【片段 ${i + 1} 摘要】\n${p}`).join("\n\n")
  }

  options.onProgress?.("正在生成摘要…", 0.9)

  const result = await chatCompletion(
    provider,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: renderFinalUserPrompt(article, finalBody, options.length, options.language) },
    ],
    { maxTokens: provider.maxTokens || 800, temperature: provider.temperature ?? 0.3, json: true }
  )

  const parsed = parseSummaryOutput(result.content)
  options.onProgress?.("完成", 1)

  return {
    oneLine: parsed.oneLine,
    points: parsed.points.slice(0, 6),
    data: parsed.data.slice(0, 8),
    conclusion: parsed.conclusion,
    providerID: provider.id,
    providerName: provider.name,
    model: result.model || provider.model,
    createdAt: Date.now(),
    chunks: chunkCount,
    contentHash: hashString(bodyText.slice(0, 4000)),
  }
}

function splitBlocksByTokens(blocks: ContentBlock[], maxTokensPerChunk: number): ContentBlock[][] {
  const groups: ContentBlock[][] = []
  let current: ContentBlock[] = []
  let currentTokens = 0
  for (const block of blocks) {
    const text =
      block.kind === "paragraph" || block.kind === "heading" || block.kind === "quote" || block.kind === "code"
        ? block.text
        : block.kind === "list"
          ? block.items.join(" ")
          : block.kind === "table"
            ? block.rows.map((r) => r.join(" ")).join(" ")
            : ""
    const tokens = estimateTokens(text) + 4
    if (currentTokens + tokens > maxTokensPerChunk && current.length) {
      groups.push(current)
      current = []
      currentTokens = 0
    }
    current.push(block)
    currentTokens += tokens
  }
  if (current.length) groups.push(current)
  return groups.length ? groups : [blocks]
}

/** AI 摘要是否已过期（正文变了 / 换了模型） */
export function summaryIsStale(article: Article): boolean {
  if (!article.aiSummary) return false
  const body = blocksToPlainText(article.blocks).slice(0, 4000)
  if (!body) return false
  return article.aiSummary.contentHash !== hashString(body)
}
