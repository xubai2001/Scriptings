/** 时间 / 尺寸 / 文本格式化工具 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** 相对时间：刚刚 / 5分钟前 / 3小时前 / 昨天 / 09-12 / 2025-05-01 */
export function relativeTime(input: string | number | undefined | null): string {
  if (input === undefined || input === null || input === "") return ""
  const ts = typeof input === "number" ? input : Date.parse(input)
  if (isNaN(ts)) return ""
  const now = Date.now()
  const diff = now - ts
  if (diff < 0) return "刚刚"
  if (diff < 45 * 1000) return "刚刚"
  if (diff < HOUR) return `${Math.round(diff / MINUTE)}分钟前`
  if (diff < DAY) return `${Math.round(diff / HOUR)}小时前`
  const d = new Date(ts)
  const today = new Date(now)
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).getTime()
  if (ts >= startOfToday - DAY && ts < startOfToday) return "昨天"
  const sameYear = d.getFullYear() === today.getFullYear()
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return sameYear ? md : `${d.getFullYear()}-${md}`
}

/** 完整时间：2026-09-19 21:30 */
export function dateTime(input: string | number | undefined | null): string {
  if (input === undefined || input === null || input === "") return ""
  const ts = typeof input === "number" ? input : Date.parse(input)
  if (isNaN(ts)) return ""
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

/** 只有日期：2026-09-19 */
export function dateOnly(input: string | number | undefined | null): string {
  const s = dateTime(input)
  return s ? s.slice(0, 10) : ""
}

export function timeOnly(input: string | number | undefined | null): string {
  if (input === undefined || input === null || input === "") return ""
  const ts = typeof input === "number" ? input : Date.parse(input)
  if (isNaN(ts)) return ""
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 活动分组标题：今天 / 昨天 / 2026-09-12 */
export function dayGroup(input: string | number): string {
  const ts = typeof input === "number" ? input : Date.parse(input)
  if (isNaN(ts)) return ""
  const now = new Date()
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime()
  if (ts >= startOfToday) return "今天"
  if (ts >= startOfToday - DAY) return "昨天"
  return dateOnly(ts)
}

/** 文件大小：1.2 KB */
export function fileSize(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  }
  const mb = bytes / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/** 列表里的提交信息首行 */
export function commitTitle(message: string): string {
  const line = (message || "").split("\n")[0].trim()
  return line || "(无提交说明)"
}

export function commitBody(message: string): string {
  const parts = (message || "").split("\n")
  parts.shift()
  return parts.join("\n").trim()
}

/** 时长（分钟）→ 中文短标签：5 分钟 / 2 小时 / 3 天 / 永不 */
export function durationLabel(minutes: number | undefined | null): string {
  if (!minutes || minutes <= 0) return "永不"
  if (minutes % 1440 === 0) return `${minutes / 1440} 天`
  if (minutes % 60 === 0) return `${minutes / 60} 小时`
  return `${minutes} 分钟`
}

/** 只保留前 n 个字符 */
export function truncate(text: string, n: number): string {
  if (!text) return ""
  return text.length > n ? `${text.slice(0, n - 1)}…` : text
}

/** 路径 / 名称的显示 */
export function dirOf(path: string): string {
  const idx = path.lastIndexOf("/")
  return idx === -1 ? "" : path.slice(0, idx)
}

export function baseName(path: string): string {
  const idx = path.lastIndexOf("/")
  return idx === -1 ? path : path.slice(idx + 1)
}

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** 字符数 / 行数统计 */
export function countLines(text: string): number {
  if (!text) return 0
  const lines = text.split("\n")
  return lines.length
}
