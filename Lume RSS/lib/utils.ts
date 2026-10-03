/**
 * 通用工具：id / 哈希 / URL / 时间 / HTML 实体 / 文本 / token 估算
 */

// ── id ───────────────────────────────────────────────────────

let idCounter = 0
export function uid(prefix = ""): string {
  idCounter = (idCounter + 1) % 100000
  return (
    prefix +
    Date.now().toString(36) +
    "-" +
    idCounter.toString(36) +
    "-" +
    Math.floor(Math.random() * 1296).toString(36)
  )
}

/** FNV-1a 32bit，足够做去重键与缓存键 */
export function hashString(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

// ── URL ──────────────────────────────────────────────────────

/** 把相对地址解析成绝对地址 */
export function resolveURL(base: string, relative: string): string {
  const rel = (relative || "").trim()
  if (!rel) return ""
  if (/^(https?:|data:|mailto:|tel:)/i.test(rel)) return rel
  if (rel.startsWith("//")) {
    const m = /^(https?:)/i.exec(base)
    return (m ? m[1] : "https:") + rel
  }
  if (!base) return rel

  const proto = /^([a-z][a-z0-9+.-]*:)\/\//i.exec(base)?.[1] ?? "https:"
  const rest = base.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
  const slash = rest.indexOf("/")
  const authority = slash >= 0 ? rest.slice(0, slash) : rest
  const basePath = slash >= 0 ? rest.slice(slash) : "/"

  if (rel.startsWith("/")) return `${proto}//${authority}${rel}`
  if (rel.startsWith("?")) return `${proto}//${authority}${basePath}${rel}`
  if (rel.startsWith("#")) return `${proto}//${authority}${basePath}${rel}`

  const dir = basePath.slice(0, basePath.lastIndexOf("/") + 1) || "/"
  const joined = dir + rel
  const out: string[] = []
  for (const seg of joined.split("/")) {
    if (seg === ".") continue
    if (seg === "..") {
      out.pop()
      continue
    }
    out.push(seg)
  }
  return `${proto}//${authority}${out.join("/")}`
}

export function originOf(url: string): string {
  const m = /^([a-z][a-z0-9+.-]*:\/\/[^/]+)/i.exec(url || "")
  return m ? m[1] : ""
}

export function hostOf(url: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url || "")
  if (!m) return ""
  return m[1].replace(/^www\./i, "")
}

/** 去掉 utm/跟踪参数、锚点，得到用于去重的 canonical 形式 */
export function canonicalURL(url: string): string {
  if (!url) return ""
  let out = url.trim().replace(/^[a-z]+:\/\//i, (m) => m.toLowerCase())
  const hashIdx = out.indexOf("#")
  if (hashIdx >= 0) out = out.slice(0, hashIdx)
  const qIdx = out.indexOf("?")
  if (qIdx >= 0) {
    const base = out.slice(0, qIdx)
    const params = out
      .slice(qIdx + 1)
      .split("&")
      .filter((p) => {
        const k = p.split("=")[0].toLowerCase()
        return !(
          k.startsWith("utm_") ||
          k === "fbclid" ||
          k === "gclid" ||
          k === "ref" ||
          k === "source" ||
          k === "spm" ||
          k === "from"
        )
      })
    out = params.length ? `${base}?${params.join("&")}` : base
  }
  return out.replace(/\/+$/, (m) => (out.length > 1 ? "" : m))
}

// ── HTML 实体 ────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  middot: "·",
  deg: "°",
  plusmn: "±",
  times: "×",
  divide: "÷",
  frac12: "½",
  laquo: "«",
  raquo: "»",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  sect: "§",
  para: "¶",
  dagger: "†",
  permil: "‰",
  larr: "←",
  rarr: "→",
  uarr: "↑",
  darr: "↓",
  harr: "↔",
  ne: "≠",
  le: "≤",
  ge: "≥",
  infin: "∞",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  pi: "π",
  sigma: "σ",
  omega: "ω",
  shy: "",
  zwj: "",
  zwnj: "",
}

export function decodeEntities(input: string): string {
  if (!input || input.indexOf("&") < 0) return input
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X"
      const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10)
      if (!isFinite(code) || code <= 0) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    const named = NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()]
    return named !== undefined ? named : match
  })
}

export function escapeHTML(input: string): string {
  return (input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// ── 文本 ─────────────────────────────────────────────────────

/** HTML → 纯文本 */
export function htmlToText(html: string): string {
  if (!html) return ""
  let out = html
  out = out.replace(/<!--[\s\S]*?-->/g, " ")
  out = out.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
  out = out.replace(/<\s*br\s*\/?\s*>/gi, "\n")
  out = out.replace(/<\/\s*(p|div|li|h[1-6]|tr|blockquote|section|article)\s*>/gi, "\n")
  out = out.replace(/<[^>]+>/g, "")
  out = decodeEntities(out)
  out = out.replace(/\r/g, "")
  out = out.replace(/[ \t\u00a0\u200b\u200d]+/g, " ")
  out = out.replace(/\n{3,}/g, "\n\n")
  return out.trim()
}

/** 压成单行，用于列表摘要 */
export function collapse(input: string, maxLength = 400): string {
  const text = (input || "").replace(/\s+/g, " ").trim()
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).replace(/[\s,，。.、;；:：-]+$/, "") + "…"
}

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/
export function hasCJK(input: string): boolean {
  return CJK_RE.test(input || "")
}

export function isMostlyCJK(input: string): boolean {
  const text = (input || "").replace(/\s/g, "")
  if (!text) return false
  let cjk = 0
  for (const ch of text) if (CJK_RE.test(ch)) cjk++
  return cjk / text.length > 0.2
}

export function detectLanguage(input: string): "zh" | "en" | "other" {
  const text = (input || "").slice(0, 800)
  if (!text.trim()) return "other"
  return isMostlyCJK(text) ? "zh" : "en"
}

/** 估算阅读时长（分钟），英文按 220 wpm，中文按 400 字/分钟 */
export function estimateReadingMinutes(text: string): number {
  const clean = (text || "").trim()
  if (!clean) return 1
  let cjk = 0
  let latinWords = 0
  const segments = clean.split(/\s+/)
  for (const seg of segments) {
    if (!seg) continue
    if (CJK_RE.test(seg)) {
      let cjkInSeg = 0
      let latinInSeg = ""
      for (const ch of seg) {
        if (CJK_RE.test(ch)) {
          cjkInSeg++
          if (latinInSeg.trim()) {
            latinWords++
            latinInSeg = ""
          }
        } else {
          latinInSeg += ch
        }
      }
      cjk += cjkInSeg
      if (latinInSeg.trim()) latinWords++
    } else {
      latinWords++
    }
  }
  const minutes = cjk / 400 + latinWords / 220
  return Math.max(1, Math.round(minutes))
}

/** 粗略 token 估算：CJK 1 token/字，拉丁 1 token ≈ 4 字符 */
export function estimateTokens(text: string): number {
  const t = text || ""
  if (!t) return 0
  let cjk = 0
  let other = 0
  for (const ch of t) {
    if (CJK_RE.test(ch)) cjk++
    else other++
  }
  return Math.ceil(cjk + other / 4)
}

// ── 时间 ─────────────────────────────────────────────────────

export function parseDate(input?: string | number | null): number {
  if (input == null || input === "") return 0
  if (typeof input === "number") return input > 1e12 ? input : input * 1000
  const raw = String(input).trim()
  if (!raw) return 0
  if (/^\d{10}$/.test(raw)) return parseInt(raw, 10) * 1000
  if (/^\d{13}$/.test(raw)) return parseInt(raw, 10)
  const direct = new Date(raw)
  if (!isNaN(direct.getTime())) return direct.getTime()
  // 容错：某些 feed 的日期缺少时区或格式古怪
  const cleaned = raw.replace(/\s+/g, " ")
  const retry = new Date(cleaned)
  if (!isNaN(retry.getTime())) return retry.getTime()
  return 0
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** 中文相对时间：2小时前 / 昨天 / Sep 20 */
export function relativeTime(timestamp: number, now = Date.now()): string {
  if (!timestamp) return ""
  const diff = now - timestamp
  if (diff < 0) {
    const ahead = -diff
    if (ahead < HOUR) return "刚刚"
    if (ahead < DAY) return `${Math.round(ahead / HOUR)} 小时后`
    return shortDate(timestamp)
  }
  if (diff < MINUTE) return "刚刚"
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`
  if (diff < 2 * DAY) return "昨天"
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`
  return shortDate(timestamp)
}

export function shortDate(timestamp: number): string {
  if (!timestamp) return ""
  const d = new Date(timestamp)
  const now = new Date()
  if (d.getFullYear() === now.getFullYear()) {
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`
  }
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export function fullDate(timestamp: number): string {
  if (!timestamp) return ""
  const d = new Date(timestamp)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 5) return "夜深了"
  if (h < 12) return "早上好"
  if (h < 18) return "下午好"
  return "晚上好"
}

// ── 数组/杂项 ────────────────────────────────────────────────

export function uniqueBy<T, K>(items: T[], key: (item: T) => K): T[] {
  const seen = new Set<K>()
  const out: T[] = []
  for (const item of items) {
    const k = key(item)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function initialsOf(title: string): string {
  const t = (title || "").trim()
  if (!t) return "?"
  const cjk = CJK_RE.test(t)
  if (cjk) return t.slice(0, 1)
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return t.slice(0, 2).toUpperCase()
}
