/**
 * Media Extractor —— 独立的媒体解析层。
 *
 * RSS 客户端不能把 HTML 当纯文本解析。这里按优先级从以下位置找图片：
 *   1. RSS media:content
 *   2. RSS media:thumbnail
 *   3. enclosure
 *   4. Atom media
 *   5. RSS description HTML
 *   6. Article HTML 中的 <img>
 *   7. Open Graph og:image（仅在抓取原网页时才有）
 */

import type { ArticleMedia, MediaKind, MediaSource } from "../models"
import { MNode, attrOf, findAll } from "./markup"
import { resolveURL, uid } from "./utils"

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|heic|heif|jfif)(?:[?#]|$)/i
const GIF_EXT = /\.gif(?:[?#]|$)/i
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|ogv|m3u8)(?:[?#]|$)/i
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)(?:[?#]|$)/i
const TRACKING_HINTS =
  /(feedburner|pixel|spacer|blank\.gif|transparent|statcounter|analytics|doubleclick|adservice|beacon|\/1x1|badge|feed-icon|gravatar)/i

export function guessKind(url: string, mimeType?: string): MediaKind {
  const mime = (mimeType || "").toLowerCase()
  if (mime.startsWith("video/") || VIDEO_EXT.test(url)) return "video"
  if (mime.startsWith("audio/") || AUDIO_EXT.test(url)) return "audio"
  if (mime === "image/gif" || GIF_EXT.test(url)) return "gif"
  return "image"
}

export function isImageLike(url: string, mimeType?: string): boolean {
  const mime = (mimeType || "").toLowerCase()
  if (mime.startsWith("image/")) return true
  return IMAGE_EXT.test(url)
}

export function makeMedia(input: {
  url: string
  type?: MediaKind
  source: MediaSource
  width?: number
  height?: number
  alt?: string
  caption?: string
}): ArticleMedia {
  return {
    id: uid("m-"),
    url: input.url,
    type: input.type ?? guessKind(input.url),
    source: input.source,
    width: input.width,
    height: input.height,
    alt: input.alt,
    caption: input.caption,
  }
}

function toNumber(value?: string): number | undefined {
  if (!value) return undefined
  const n = parseFloat(value)
  return isFinite(n) && n > 0 ? Math.round(n) : undefined
}

/** 明显的追踪像素 / 装饰图 */
export function isJunkMedia(media: ArticleMedia): boolean {
  // 只接受 http(s) 的远程图片；data: URI 多为占位图/追踪像素
  if (!/^https?:/i.test(media.url)) return true
  if (TRACKING_HINTS.test(media.url)) return true
  if (media.width !== undefined && media.height !== undefined) {
    if (media.width <= 32 || media.height <= 32) return true
    if (media.width * media.height <= 1024) return true
  }
  if (media.width !== undefined && media.width <= 32) return true
  return false
}

// ── srcset ───────────────────────────────────────────────────

export function parseSrcset(value: string, baseURL: string): Array<{ url: string; width: number }> {
  if (!value) return []
  const out: Array<{ url: string; width: number }> = []
  for (const part of value.split(",")) {
    const pieces = part.trim().split(/\s+/)
    if (!pieces[0]) continue
    const url = resolveURL(baseURL, pieces[0])
    if (!url) continue
    let width = 0
    const descriptor = pieces[1] || ""
    const wMatch = /^(\d+)w$/i.exec(descriptor)
    const xMatch = /^([\d.]+)x$/i.exec(descriptor)
    if (wMatch) width = parseInt(wMatch[1], 10)
    else if (xMatch) width = Math.round(parseFloat(xMatch[1]) * 1000)
    out.push({ url, width })
  }
  return out
}

/** 从 srcset 里挑最大的那一张 */
export function bestFromSrcset(value: string, baseURL: string): string | undefined {
  const items = parseSrcset(value, baseURL)
  if (!items.length) return undefined
  items.sort((a, b) => b.width - a.width)
  return items[0].url
}

// ── <img> ────────────────────────────────────────────────────

export function mediaFromImagNode(node: MNode, baseURL: string): ArticleMedia | undefined {
  const lazyCandidates = [
    "src",
    "data-src",
    "data-original",
    "data-lazy-src",
    "data-actualsrc",
    "data-url",
    "data-image",
  ]
  let raw = ""
  for (const key of lazyCandidates) {
    const value = attrOf(node, key)
    if (value && !/^data:image\/gif;base64,R0lGOD/i.test(value)) {
      raw = value
      break
    }
  }
  const srcset = attrOf(node, "srcset") || attrOf(node, "data-srcset")
  const fromSrcset = srcset ? bestFromSrcset(srcset, baseURL) : undefined
  let url = raw ? resolveURL(baseURL, raw) : ""
  if (fromSrcset) {
    // 优先 srcset 里更大的图
    if (!url || (fromSrcset && fromSrcset !== url)) url = fromSrcset
  }
  if (!url) return undefined
  if (url.startsWith("data:")) return undefined

  const media = makeMedia({
    url,
    type: guessKind(url, attrOf(node, "type")),
    source: "content",
    width: toNumber(attrOf(node, "width")),
    height: toNumber(attrOf(node, "height")),
    alt: attrOf(node, "alt") || undefined,
  })
  return isJunkMedia(media) ? undefined : media
}

/** 从一个 HTML 片段里收集所有 <img> / <picture><source> */
export function mediaFromHTML(root: MNode, baseURL: string, source: MediaSource = "content"): ArticleMedia[] {
  const out: ArticleMedia[] = []
  const visit = (node: MNode) => {
    for (const child of node.children) {
      if (child.tag === "img") {
        const media = mediaFromImagNode(child, baseURL)
        if (media) {
          media.source = source
          out.push(media)
        }
      } else if (child.tag === "source") {
        const srcset = attrOf(child, "srcset")
        const type = attrOf(child, "type")
        const url = srcset ? bestFromSrcset(srcset, baseURL) : ""
        if (url && /^image\//i.test(type || "image/")) {
          out.push(makeMedia({ url, source, type: guessKind(url, type) }))
        }
      } else {
        visit(child)
      }
    }
  }
  visit(root)
  return out
}

// ── RSS / Atom 里的显式媒体元素 ──────────────────────────────

function fromRSSMediaNode(node: MNode, source: MediaSource, baseURL: string): ArticleMedia | undefined {
  const url = attrOf(node, "url") || attrOf(node, "href")
  if (!url) return undefined
  const resolved = resolveURL(baseURL, url)
  if (!resolved) return undefined
  const mime = attrOf(node, "type") || attrOf(node, "medium")
  const kind = /video/i.test(attrOf(node, "medium"))
    ? "video"
    : /audio/i.test(attrOf(node, "medium"))
      ? "audio"
      : guessKind(resolved, mime)
  return makeMedia({
    url: resolved,
    type: kind,
    source,
    width: toNumber(attrOf(node, "width")),
    height: toNumber(attrOf(node, "height")),
    alt: attrOf(node, "description") || attrOf(node, "title") || undefined,
  })
}

/**
 * 把一个 item / entry 节点里声明的媒体全部收集起来（按优先级排序）。
 */
export function collectDeclaredMedia(item: MNode, baseURL: string): ArticleMedia[] {
  const out: ArticleMedia[] = []

  // 1. media:content
  for (const node of findAll(item, "media:content")) {
    const media = fromRSSMediaNode(node, "media:content", baseURL)
    if (media && (media.type === "image" || media.type === "gif")) out.push(media)
  }
  // 2. media:thumbnail
  for (const node of findAll(item, "media:thumbnail")) {
    const media = fromRSSMediaNode(node, "media:thumbnail", baseURL)
    if (media) out.push(media)
  }
  // 3. enclosure
  for (const node of findAll(item, "enclosure")) {
    const url = attrOf(node, "url")
    const mime = attrOf(node, "type")
    if (!url) continue
    const resolved = resolveURL(baseURL, url)
    if (!isImageLike(resolved, mime) && !/^(video|audio)\//i.test(mime)) continue
    out.push(
      makeMedia({
        url: resolved,
        type: guessKind(resolved, mime),
        source: "enclosure",
        width: toNumber(attrOf(node, "width")),
        height: toNumber(attrOf(node, "height")),
      })
    )
  }
  // 4. Atom media（<link rel="enclosure"> / <link rel="image">）
  for (const node of findAll(item, "link")) {
    const rel = (attrOf(node, "rel") || "").toLowerCase()
    const type = attrOf(node, "type")
    const href = attrOf(node, "href")
    if (!href) continue
    if (rel === "enclosure" && (isImageLike(href, type) || /^(video|audio)\//i.test(type))) {
      out.push(makeMedia({ url: resolveURL(baseURL, href), type: guessKind(href, type), source: "atom" }))
    } else if (rel === "image") {
      out.push(makeMedia({ url: resolveURL(baseURL, href), source: "atom" }))
    }
  }
  // itunes / podcast 封面
  const itunesImage = findAll(item, "itunes:image")[0]
  if (itunesImage) {
    const href = attrOf(itunesImage, "href")
    if (href) out.push(makeMedia({ url: resolveURL(baseURL, href), source: "atom" }))
  }

  return out
}

/** 为 feed 找图标（channel image / icon / logo） */
export function collectFeedIcon(root: MNode, baseURL: string): string | undefined {
  const candidates: string[] = []
  for (const node of findAll(root, "image")) {
    const url = (node.text || "").trim() || attrOf(node, "href") || attrOf(node, "url")
    if (url && !/^</.test(url)) candidates.push(resolveURL(baseURL, url))
    const inner = node.children.find((c) => c.tag === "url")
    if (inner && inner.text.trim()) candidates.push(resolveURL(baseURL, inner.text.trim()))
  }
  for (const node of findAll(root, "icon")) {
    if (node.text.trim()) candidates.push(resolveURL(baseURL, node.text.trim()))
  }
  for (const node of findAll(root, "logo")) {
    if (node.text.trim()) candidates.push(resolveURL(baseURL, node.text.trim()))
  }
  for (const node of findAll(root, "itunes:image")) {
    const href = attrOf(node, "href")
    if (href) candidates.push(resolveURL(baseURL, href))
  }
  for (const node of findAll(root, "image")) {
    const href = attrOf(node, "href")
    if (href) candidates.push(resolveURL(baseURL, href))
  }
  return candidates.find((c) => !!c)
}

// ── 汇总 ─────────────────────────────────────────────────────

export function dedupeMedia(list: ArticleMedia[]): ArticleMedia[] {
  const seen = new Set<string>()
  const out: ArticleMedia[] = []
  for (const media of list) {
    if (!media.url) continue
    const key = media.url.replace(/^https?:/i, "").replace(/[?#].*$/, "")
    if (seen.has(key)) continue
    if (isJunkMedia(media)) continue
    seen.add(key)
    out.push(media)
  }
  return out
}

/** 挑一张“主图”用于列表卡片 */
export function heroImage(images: ArticleMedia[] | undefined): ArticleMedia | undefined {
  if (!images || !images.length) return undefined
  const eligible = images.filter((m) => (m.type === "image" || m.type === "gif") && !isJunkMedia(m))
  if (!eligible.length) return undefined
  const wide = eligible.find((m) => (m.width ?? 0) >= 400 || (m.height ?? 0) >= 260)
  return wide ?? eligible[0]
}
