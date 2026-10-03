/**
 * GitHub REST 客户端 —— 所有网络请求的唯一出口。
 *
 * 统一处理：Authentication / Rate Limit / HTTP Error / Retry / Timeout / Pagination。
 * UI 层不允许自己拼 URL。
 */

import { fetch, RequestInit } from "scripting"
import type { Response, Headers } from "scripting"
import { GitHubError } from "../utils/errors"
import { getToken } from "./auth"
import { getSettings, netState } from "../services/store"

export const API_BASE = "https://api.github.com"
const API_VERSION = "2022-11-28"
const DEFAULT_TIMEOUT = 25

function defaultTimeout(): number {
  const value = getSettings().requestTimeout
  return value && value > 0 ? value : DEFAULT_TIMEOUT
}

export type RateLimitInfo = {
  limit: number
  remaining: number
  resetAt: number
  checkedAt: number
}

export const rateLimit: { current: RateLimitInfo | null } = { current: null }

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"

export type RequestOptions = {
  method?: HttpMethod
  /** 以 / 开头的路径，例如 /repos/owner/name */
  path: string
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  /** 自定义 Accept，默认 application/vnd.github+json */
  accept?: string
  /** 返回原始文本而不是 JSON */
  asText?: boolean
  /** 返回二进制 Data */
  asData?: boolean
  /** 公开接口，不需要令牌 */
  anonymous?: boolean
  /** 指定令牌（用于验证一个尚未保存的新账户） */
  token?: string
  timeout?: number
  retries?: number
  /** 日志面板里的标签 */
  label?: string
}

export function buildURL(
  path: string,
  query?: Record<string, string | number | boolean | undefined | null>
): string {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`
  if (!query) return url
  const parts: string[] = []
  Object.keys(query).forEach(key => {
    const value = query[key]
    if (value === undefined || value === null || value === "") return
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  })
  if (parts.length === 0) return url
  return `${url}${url.indexOf("?") === -1 ? "?" : "&"}${parts.join("&")}`
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function readRateLimit(headers: Headers): void {
  const limit = headers.get("x-ratelimit-limit")
  const remaining = headers.get("x-ratelimit-remaining")
  const reset = headers.get("x-ratelimit-reset")
  if (limit === null && remaining === null) return
  rateLimit.current = {
    limit: Number(limit || 0),
    remaining: Number(remaining || 0),
    resetAt: Number(reset || 0) * 1000,
    checkedAt: Date.now(),
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text()
    if (!text) return response.statusText || ""
    try {
      const json = JSON.parse(text)
      const message = json && json.message ? String(json.message) : ""
      const errors = json && json.errors
      if (errors && Array.isArray(errors) && errors.length > 0) {
        const extra = errors
          .map((e: any) => (e && (e.message || e.code || e.field) ? String(e.message || e.code || e.field) : ""))
          .filter((s: string) => !!s)
          .join("; ")
        return extra ? `${message} (${extra})` : message
      }
      return message || text.slice(0, 300)
    } catch {
      return text.slice(0, 300)
    }
  } catch {
    return response.statusText || ""
  }
}

/** 单次请求（不含重试） */
async function once<T>(options: RequestOptions, attempt: number): Promise<T> {
  const token = options.token || (options.anonymous ? null : getToken())
  if (!options.anonymous && !token) {
    // 没有令牌就不发请求：给出明确提示，而不是让 GitHub 回 403
    throw new GitHubError(401, "Missing access token", options.path)
  }
  const headers: Record<string, string> = {
    Accept: options.accept || "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const init: RequestInit = {
    method: options.method || "GET",
    headers,
    timeout: options.timeout || defaultTimeout(),
    debugLabel: options.label || options.path,
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json"
    init.body = JSON.stringify(options.body)
  }

  const url = buildURL(options.path, options.query)
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (e) {
    // 网络层异常：统一抛成可重试的错误
    const raw = e instanceof Error ? e.message : String(e)
    netState.online = false
    netState.lastFailure = Date.now()
    throw new GitHubError(0, raw, options.path)
  }

  netState.online = true
  netState.lastSuccess = Date.now()
  readRateLimit(response.headers)

  if (!response.ok) {
    const message = await parseErrorMessage(response)
    throw new GitHubError(response.status, message, options.path)
  }

  if (options.asData) {
    return (await response.data()) as unknown as T
  }
  if (options.asText) {
    return (await response.text()) as unknown as T
  }
  if (response.status === 204) {
    return undefined as unknown as T
  }
  const text = await response.text()
  if (!text) return undefined as unknown as T
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}

/** 统一入口：带重试的请求 */
export async function request<T = any>(options: RequestOptions): Promise<T> {
  const maxAttempts = Math.max(1, (options.retries ?? 2) + 1)
  let lastError: unknown = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await once<T>(options, attempt)
    } catch (e) {
      lastError = e
      const status = e instanceof GitHubError ? e.status : 0
      const retryable =
        status === 0 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504
      if (!retryable || attempt === maxAttempts - 1) throw e
      await delay(400 * Math.pow(2, attempt))
    }
  }
  throw lastError
}

export const api = {
  get: <T = any>(path: string, query?: RequestOptions["query"], extra?: Partial<RequestOptions>) =>
    request<T>({ path, query, method: "GET", ...(extra || {}) }),
  post: <T = any>(path: string, body?: unknown, extra?: Partial<RequestOptions>) =>
    request<T>({ path, body, method: "POST", ...(extra || {}) }),
  patch: <T = any>(path: string, body?: unknown, extra?: Partial<RequestOptions>) =>
    request<T>({ path, body, method: "PATCH", ...(extra || {}) }),
  put: <T = any>(path: string, body?: unknown, extra?: Partial<RequestOptions>) =>
    request<T>({ path, body, method: "PUT", ...(extra || {}) }),
  del: <T = any>(path: string, body?: unknown, extra?: Partial<RequestOptions>) =>
    request<T>({ path, body, method: "DELETE", ...(extra || {}) }),
}

/** 分页拉取（最多 pages 页，每页 perPage 条） */
export async function paginate<T = any>(
  path: string,
  query: RequestOptions["query"],
  perPage: number,
  pages: number,
  extra?: Partial<RequestOptions>
): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; page <= pages; page++) {
    const result = await request<T[]>({
      path,
      query: { ...(query || {}), per_page: perPage, page },
      ...(extra || {}),
    })
    if (!Array.isArray(result) || result.length === 0) break
    out.push(...result)
    if (result.length < perPage) break
  }
  return out
}
