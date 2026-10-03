/**
 * 错误处理：把 HTTP / 网络错误翻译成用户能看懂的话，
 * 同时保留原始信息（HTTP 状态、GitHub message）供「查看详情」展开。
 */

export type ErrorInfo = {
  /** 面向用户的标题，例如「同步失败」 */
  title: string
  /** 面向用户的说明 */
  message: string
  /** 可展开的原始信息 */
  detail: string
  httpStatus: number
  /** 是否值得重试 */
  retryable: boolean
  /** 是否属于「远程已被修改」 */
  conflict: boolean
}

export class GitHubError extends Error {
  status: number
  apiMessage: string
  detail: string
  path: string

  constructor(status: number, apiMessage: string, path: string) {
    super(`HTTP ${status}${apiMessage ? `: ${apiMessage}` : ""} @ ${path}`)
    this.status = status
    this.apiMessage = apiMessage
    this.path = path
    this.detail = `HTTP ${status}${apiMessage ? `\n${apiMessage}` : ""}\n${path}`
  }
}

export function isGitHubError(e: unknown): e is GitHubError {
  return e instanceof GitHubError
}

/** GitHub 常见状态码 → 中文解释 */
export function explain(status: number, apiMessage: string): { title: string; message: string; retryable: boolean; conflict: boolean } {
  const lower = (apiMessage || "").toLowerCase()
  if (lower.indexOf("missing access token") !== -1) {
    return {
      title: "尚未配置访问令牌",
      message: "请先在「设置 → GitHub 账户」里填写 Personal Access Token。",
      retryable: false,
      conflict: false,
    }
  }
  if (status === 401) {
    return {
      title: "授权失效",
      message: "GitHub 拒绝了当前的访问令牌，请在「设置 → GitHub 账户」重新填写。",
      retryable: false,
      conflict: false,
    }
  }
  if (status === 403) {
    if (lower.indexOf("rate limit") !== -1 || lower.indexOf("abuse") !== -1) {
      return {
        title: "请求过于频繁",
        message: "已达到 GitHub 的频率限制，请稍后再试。",
        retryable: true,
        conflict: false,
      }
    }
    return {
      title: "没有权限",
      message: "当前令牌缺少这项操作的权限，请检查令牌的 scope。",
      retryable: false,
      conflict: false,
    }
  }
  if (status === 404) {
    return {
      title: "内容不存在",
      message: "GitHub 找不到这个仓库、Gist 或文件，可能已被删除或改名。",
      retryable: false,
      conflict: false,
    }
  }
  if (status === 409) {
    return {
      title: "远程内容已变化",
      message: "GitHub 拒绝了这次修改：远程文件已经变了。请先查看差异再决定如何合并。",
      retryable: false,
      conflict: true,
    }
  }
  if (status === 422) {
    return {
      title: "GitHub 拒绝了这次修改",
      message: "远程内容可能已经发生变化，或者提交信息/文件内容不合法。",
      retryable: false,
      conflict: true,
    }
  }
  if (status === 429) {
    return {
      title: "请求过于频繁",
      message: "GitHub 要求稍后再试。",
      retryable: true,
      conflict: false,
    }
  }
  if (status >= 500) {
    return {
      title: "GitHub 服务异常",
      message: "GitHub 暂时不可用，稍后重试通常就能成功。",
      retryable: true,
      conflict: false,
    }
  }
  return {
    title: "请求失败",
    message: "GitHub 返回了预期之外的结果。",
    retryable: status >= 500,
    conflict: false,
  }
}

export function toErrorInfo(e: unknown, fallbackTitle = "操作失败"): ErrorInfo {
  if (isGitHubError(e)) {
    const ex = explain(e.status, e.apiMessage)
    return {
      title: ex.title,
      message: ex.message,
      detail: e.detail,
      httpStatus: e.status,
      retryable: ex.retryable,
      conflict: ex.conflict,
    }
  }
  const raw = e instanceof Error ? e.message : String(e)
  const lower = (raw || "").toLowerCase()
  const offline =
    lower.indexOf("offline") !== -1 ||
    lower.indexOf("network") !== -1 ||
    lower.indexOf("internet") !== -1 ||
    lower.indexOf("timed out") !== -1 ||
    lower.indexOf("timeout") !== -1 ||
    lower.indexOf("connection") !== -1 ||
    lower.indexOf("host") !== -1
  if (offline) {
    return {
      title: "网络不可用",
      message: "当前无法连接 GitHub。你的内容已经保存在本地，联网后可以重试。",
      detail: raw,
      httpStatus: 0,
      retryable: true,
      conflict: false,
    }
  }
  return {
    title: fallbackTitle,
    message: raw || "发生了未知错误。",
    detail: raw,
    httpStatus: 0,
    retryable: true,
    conflict: false,
  }
}

/**
 * 本地校验错误：不是 HTTP 错误，但用同一套 UI 呈现。
 * 用于在发请求之前拦住 GitHub 一定会拒绝的操作（例如 content 为空字符串时必定 422）。
 */
export function validationError(title: string, message: string, detail = ""): ErrorInfo {
  return { title, message, detail, httpStatus: 0, retryable: false, conflict: false }
}

export function errorTitle(e: unknown, fallback = "操作失败"): string {
  return toErrorInfo(e, fallback).title
}
