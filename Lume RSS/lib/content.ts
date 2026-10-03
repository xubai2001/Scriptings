/**
 * Content Extractor —— HTML → 结构化正文块。
 *
 * 产出被标签化的 block 列表（noise 标记），于是：
 *   · 原文模式 = 全部 block
 *   · 阅读模式 = 过滤掉 noise 的 block
 * 同时负责「原网页正文解析」（readability-lite）与 OG 元数据提取。
 */

import type { ArticleMedia, ContentBlock, MediaKind } from "../models"
import { MNode, attrOf, documentRoot, findAll, findAllDeep, find, innerHTML as serializeNode, parseMarkup } from "./markup"
import { bestFromSrcset, guessKind, isJunkMedia, mediaFromImagNode, makeMedia } from "./media"
import { collapse, htmlToText, resolveURL, uid } from "./utils"

// ── 噪声识别 ─────────────────────────────────────────────────

const NOISE_ATTR_RE =
  /(^|[-_\s])(ad|ads|advert|advertisement|sponsor|sponsored|promo|promotion|share|sharing|social|subscribe|newsletter|signup|related|recommend|recommendation|comment|comments|disqus|sidebar|widget|footer|nav|navbar|menu|breadcrumb|cookie|consent|popup|modal|paywall|toolbar|meta-|author-bio|read-next|more-from|trending|popular|outbrain|taboola|dfp|banner)([-_\s]|$)/i

const NOISE_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "canvas",
  "form",
  "input",
  "button",
  "select",
  "option",
  "textarea",
  "nav",
  "aside",
  "footer",
  "template",
  "dialog",
])

const DROP_PHRASES = [
  /^the post .{0,120}appeared first on/i,
  /^appeared first on /i,
  /^(read|continue reading|read more|learn more)\b.{0,30}$/i,
  /^(share|sharing|share this|tweet|post|like)( on| this| it)?[.:!]?$/i,
  /^(阅读原文|原文链接|继续阅读|点击阅读全文|分享到|关注我们|订阅|扫码关注|广告)[:：]?$/,
  /^(follow us|subscribe|sign up|join our|don'?t miss)/i,
  /^(photo|image|credit)s?:\s*$/i,
  /^all rights reserved\.?$/i,
]

function hasNoiseAttr(node: MNode): boolean {
  const marker = `${attrOf(node, "class")} ${attrOf(node, "id")} ${attrOf(node, "role")}`
  return NOISE_ATTR_RE.test(marker)
}

function isNoiseContext(node: MNode): boolean {
  let current: MNode | undefined = node
  while (current && current.tag !== "#root") {
    if (NOISE_TAGS.has(current.tag)) return true
    if (current.tag === "header" && current.children.some((c) => c.tag === "nav")) return true
    if (hasNoiseAttr(current)) return true
    current = current.parent
  }
  return false
}

function isDropPhrase(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (t.length > 220) return false
  return DROP_PHRASES.some((re) => re.test(t))
}

// ── 内容级噪声识别（第二道关）─────────────────────────────────
// DOM 层的 class/id 提示只能抓到一部分；而且「原网页正文」那条路径已经在提取前把
// 可疑节点删掉了，所以剩下的模板文字完全靠文本特征才能识别。
// 规则宁漏不误：宁可少删，也不能把正文认成噪声。

/** 典型「点出去」的链接文案 */
const LINK_OUT_RE =
  /(查看全文|阅读全文|阅读原文|原文链接|点击这里|点击查看|查看详情|查看更多|详见|read more|read the full|continue reading|view original|see the original|full (article|story)|permalink|original (article|post))/i

/** 社交 / 版权 / 推广 / 推荐 / 元信息类模板文字 */
const SOCIAL_RE =
  /(关注我们|扫码关注|微信公众号|公众号|分享到|点击分享|转发|转载|授权|版权|免责声明|相关阅读|推荐阅读|更多精彩|猜你喜欢|点赞|打赏|赞赏|充电|广告|赞助|商业合作|投稿|欢迎在|评论区|首发|未经许可|本文作者|责编|编辑：|题图|文中观点|在看|更多内容|阅读时长|字数|thanks for reading|if you liked|support us|become a member|follow (me|us)|subscribe|sign up|newsletter|share this|advertisement|sponsored|related posts?|you might also like|discuss this|appeared first on|originally published|all rights reserved|tags:|filed under|categories:)/i

/** feed 里的元信息块（如 HN 的 Article URL: … Comments URL: … Points: …） */
const META_RE = /^(article url|comments url|points|#\s*comments|read time|reading time|source:|via:)/i

/** 常见 emoji 区段（平台正则不支持 \p{Emoji}，自己扫码点） */
function hasEmoji(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (
      (code >= 0x1f300 && code <= 0x1faff) ||
      (code >= 0x1f000 && code <= 0x1f2ff) ||
      (code >= 0x2600 && code <= 0x27bf) ||
      (code >= 0x2b00 && code <= 0x2bff) ||
      (code >= 0x2190 && code <= 0x21ff) ||
      code === 0xfe0f
    ) {
      return true
    }
  }
  return false
}

/** 站点标识（sspai.com → sspai），用于识别「…尽在少数派官方店铺」这类结尾推广 */
function siteToken(url: string): string {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url || "")
  if (!m) return ""
  const host = m[1].toLowerCase().replace(/^www\./, "")
  return (host.split(".")[0] ?? "").replace(/[^a-z0-9]/g, "")
}

function blockText(block: ContentBlock): string {
  switch (block.kind) {
    case "list":
      return block.items.join(" ")
    case "table":
      return block.rows.map((row) => row.join(" ")).join(" ")
    case "image":
    case "video":
    case "divider":
      return ""
    default:
      return block.text
  }
}

function urlCharRatio(text: string): number {
  if (!text) return 0
  const urls = text.match(/https?:\/\/[^\s，。；）)】"]+/g) ?? []
  return urls.reduce((sum, url) => sum + url.length, 0) / text.length
}

/** 按文本特征标记噪声块（原地修改 blocks） */
function tagContentNoise(blocks: ContentBlock[], baseURL: string): void {
  const candidates = blocks.filter((b) => b.kind !== "image" && b.kind !== "video" && b.kind !== "divider")
  if (!candidates.length) return
  // 全篇最长的一块必定是正文，永不标记
  const longest = candidates.reduce((best, b) => (blockText(b).length > blockText(best).length ? b : best))
  const site = siteToken(baseURL)

  // 尾部区域：正文结束后剩下的短块通常是推广 / 版权 / 计数
  const tail = new Set<string>()
  const content = blocks.filter(
    (b) => b.kind === "paragraph" || b.kind === "heading" || b.kind === "list" || b.kind === "quote"
  )
  for (const block of content.slice(-3)) tail.add(block.id)

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.noise) continue
    if (block.kind === "image" || block.kind === "video" || block.kind === "divider") continue

    const text = blockText(block).trim()
    if (!text) {
      block.noise = true
      continue
    }
    // 高置信度规则：元信息 / 链接堆。即使它是全篇最长的一块也照样标（HN 的 feed 正文就是这种）
    if (META_RE.test(text)) {
      block.noise = true
      continue
    }
    if (text.length >= 40 && urlCharRatio(text) >= 0.45) {
      block.noise = true
      continue
    }

    // 以下规则误伤风险高，只对「不是首块、也不是全篇最长块」生效
    if (i === 0 || block === longest) continue
    // 标题只认元信息 / 链接堆积，避免把「订阅」这类正题标题误伤
    if (block.kind === "heading") continue
    if (text.length <= 60 && LINK_OUT_RE.test(text)) {
      block.noise = true
      continue
    }
    if (text.length <= 80 && SOCIAL_RE.test(text)) {
      block.noise = true
      continue
    }
    // 结尾处的短块：带 emoji、带域名、或带站点名的，基本是推广语
    if (tail.has(block.id) && text.length <= 50) {
      const looksPromotional =
        hasEmoji(text) ||
        /\b[a-z0-9-]+\.(com|cn|net|org|io|me|app|xyz|co)\b/i.test(text) ||
        (!!site && text.toLowerCase().includes(site))
      if (looksPromotional) {
        block.noise = true
        continue
      }
    }
  }

  // 兜底：不能把整篇都判成噪声
  if (!blocks.some((b) => !b.noise && blockText(b).trim().length > 0)) longest.noise = false
}

// ── 内联文本 ─────────────────────────────────────────────────

const INLINE_SKIP = new Set(["script", "style", "noscript", "svg", "canvas", "form", "input", "button"])

function inlineText(node: MNode): string {
  let out = node.text
  for (const child of node.children) {
    if (INLINE_SKIP.has(child.tag)) continue
    if (child.tag === "br") {
      out += "\n"
      continue
    }
    if (child.tag === "img" || child.tag === "picture" || child.tag === "video" || child.tag === "audio") continue
    out += inlineText(child)
  }
  return normalizeText(out)
}

function normalizeText(input: string): string {
  return (input || "")
    .replace(/\r/g, "")
    .replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""))
    .join("\n")
    .trim()
}

function inlineHTML(node: MNode): string {
  let out = node.text
  for (const child of node.children) {
    if (child.tag === "br") out += " "
    else out += inlineHTML(child)
  }
  return out
}

// ── 块提取 ───────────────────────────────────────────────────

interface ExtractContext {
  baseURL: string
  title?: string
  blocks: ContentBlock[]
  images: ArticleMedia[]
  skippedLeadingHeading: boolean
}

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "main",
  "header",
  "footer",
  "aside",
  "blockquote",
  "figure",
  "figcaption",
  "pre",
  "ul",
  "ol",
  "li",
  "table",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "video",
  "audio",
  "iframe",
  "picture",
  "details",
  "summary",
  "dl",
  "dt",
  "dd",
])

function pushBlock(ctx: ExtractContext, block: ContentBlock) {
  ctx.blocks.push(block)
}

function blockID(): string {
  return uid("b-")
}

function paragraph(ctx: ExtractContext, node: MNode, noise: boolean) {
  const text = inlineText(node)
  // 段落里嵌的图片要单独成块，正文图片必须直接显示
  const innerImages: ArticleMedia[] = []
  const collect = (n: MNode) => {
    for (const child of n.children) {
      if (child.tag === "img") {
        const media = mediaFromImagNode(child, ctx.baseURL)
        if (media) innerImages.push(media)
      } else if (child.tag === "picture") {
        const img = find(child, "img")
        if (img) {
          const media = mediaFromImagNode(img, ctx.baseURL)
          if (media) innerImages.push(media)
        }
      } else if (!BLOCK_TAGS.has(child.tag)) {
        collect(child)
      }
    }
  }
  collect(node)

  if (text && !isDropPhrase(text)) {
    pushBlock(ctx, { kind: "paragraph", id: blockID(), text, noise })
  }
  for (const media of innerImages) {
    ctx.images.push(media)
    pushBlock(ctx, { kind: "image", id: blockID(), media, noise })
  }
}

function imageBlock(ctx: ExtractContext, node: MNode, caption: string | undefined, noise: boolean) {
  const media = mediaFromImagNode(node, ctx.baseURL)
  if (!media) return
  if (caption) media.caption = collapse(htmlToText(caption), 200)
  ctx.images.push(media)
  pushBlock(ctx, { kind: "image", id: blockID(), media, noise })
}

function mediaBlock(ctx: ExtractContext, node: MNode, kind: MediaKind, noise: boolean) {
  let url = attrOf(node, "src")
  if (!url) {
    const source = find(node, "source")
    if (source) url = attrOf(source, "src")
  }
  if (!url) return
  const resolved = resolveURL(ctx.baseURL, url)
  if (!resolved) return
  const media = makeMedia({
    url: resolved,
    type: kind,
    source: "content",
    width: node.attrs["width"] ? parseInt(node.attrs["width"], 10) : undefined,
    alt: attrOf(node, "title") || attrOf(node, "alt") || undefined,
  })
  ctx.images.push(media)
  pushBlock(ctx, { kind: "video", id: blockID(), media, noise })
}

function listBlock(ctx: ExtractContext, node: MNode, noise: boolean) {
  const ordered = node.tag === "ol"
  const items: string[] = []
  for (const li of findAll(node, "li")) {
    const text = inlineText(li)
    if (text) items.push(text)
  }
  if (!items.length) return
  // 列表里如果有图片，也要显示
  const nested: ArticleMedia[] = []
  for (const li of findAll(node, "li")) {
    for (const img of [...findAll(li, "img")]) {
      const media = mediaFromImagNode(img, ctx.baseURL)
      if (media) nested.push(media)
    }
  }
  pushBlock(ctx, { kind: "list", id: blockID(), ordered, items, noise })
  for (const media of nested) {
    ctx.images.push(media)
    pushBlock(ctx, { kind: "image", id: blockID(), media, noise })
  }
}

function quoteBlock(ctx: ExtractContext, node: MNode, noise: boolean) {
  const citeNode = find(node, "cite")
  const text = inlineText(node)
  const cite = citeNode ? inlineText(citeNode) : ""
  if (!text) return
  pushBlock(ctx, { kind: "quote", id: blockID(), text, cite: cite || undefined, noise })
}

function codeBlock(ctx: ExtractContext, node: MNode, noise: boolean) {
  const codeNode = find(node, "code")
  const raw = (codeNode ? codeNode.text : node.text).replace(/\n+$/, "")
  if (!raw.trim()) return
  const cls = attrOf(codeNode ?? node, "class")
  const langMatch = /(?:language|lang|brush|highlight)[-:]([a-z0-9+#]+)/i.exec(cls)
  pushBlock(ctx, { kind: "code", id: blockID(), text: raw, language: langMatch?.[1], noise })
}

function headingBlock(ctx: ExtractContext, node: MNode, noise: boolean) {
  const text = inlineText(node)
  if (!text || isDropPhrase(text)) return
  if (!ctx.skippedLeadingHeading && ctx.title) {
    ctx.skippedLeadingHeading = true
    const a = text.replace(/\s+/g, "").toLowerCase()
    const b = ctx.title.replace(/\s+/g, "").toLowerCase()
    if (a === b || (a.length > 6 && b.length > 6 && (a.includes(b) || b.includes(a)))) return
  } else {
    ctx.skippedLeadingHeading = true
  }
  const level = parseInt(node.tag.slice(1), 10) || 2
  pushBlock(ctx, { kind: "heading", id: blockID(), level, text, noise })
}

function tableBlock(ctx: ExtractContext, node: MNode, noise: boolean) {
  const rows: string[][] = []
  // tr 常常被 tbody / thead 包着，所以要深度查找
  for (const tr of findAllDeep(node, "tr")) {
    const cells: string[] = []
    for (const cell of tr.children) {
      if (cell.tag === "td" || cell.tag === "th") cells.push(inlineText(cell))
    }
    if (cells.some((c) => c)) rows.push(cells)
  }
  if (!rows.length) return
  // 单行单列且很短的表通常只是布局
  if (rows.length === 1 && rows[0].length === 1 && rows[0][0].length < 40) {
    pushBlock(ctx, { kind: "paragraph", id: blockID(), text: rows[0][0], noise })
    return
  }
  pushBlock(ctx, { kind: "table", id: blockID(), rows, noise })
}

function figureBlock(ctx: ExtractContext, node: MNode, noise: boolean) {
  const img = find(node, "img")
  const caption = find(node, "figcaption")
  const captionText = caption ? inlineHTML(caption) : ""
  if (img) {
    imageBlock(ctx, img, captionText, noise)
    return
  }
  const video = find(node, "video")
  if (video) {
    mediaBlock(ctx, video, "video", noise)
    return
  }
  walkChildren(ctx, node, noise)
}

function iframeBlock(ctx: ExtractContext, node: MNode, noise: boolean) {
  const src = attrOf(node, "src") || attrOf(node, "data-src")
  if (!src) return
  const resolved = resolveURL(ctx.baseURL, src)
  if (/youtube\.com|youtu\.be|vimeo\.com|bilibili\.com|player\.|\.mp4/i.test(resolved)) {
    ctx.images.push(makeMedia({ url: resolved, type: "video", source: "content" }))
    pushBlock(ctx, { kind: "video", id: blockID(), media: makeMedia({ url: resolved, type: "video", source: "content" }), noise })
  }
}

function visit(ctx: ExtractContext, node: MNode, noise: boolean) {
  const tag = node.tag
  if (NOISE_TAGS.has(tag)) {
    if (tag === "input" || tag === "button" || tag === "select" || tag === "textarea") return
    return
  }
  const nodeNoise = noise || hasNoiseAttr(node)

  switch (tag) {
    case "p":
    case "dt":
    case "dd":
    case "summary":
      paragraph(ctx, node, nodeNoise)
      return
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      headingBlock(ctx, node, nodeNoise)
      return
    case "blockquote":
      quoteBlock(ctx, node, nodeNoise)
      return
    case "pre":
      codeBlock(ctx, node, nodeNoise)
      return
    case "ul":
    case "ol":
      listBlock(ctx, node, nodeNoise)
      return
    case "table":
      tableBlock(ctx, node, nodeNoise)
      return
    case "figure":
      figureBlock(ctx, node, nodeNoise)
      return
    case "figcaption":
      return
    case "img":
      imageBlock(ctx, node, undefined, nodeNoise)
      return
    case "picture": {
      const img = find(node, "img")
      if (img) imageBlock(ctx, img, undefined, nodeNoise)
      else {
        const source = find(node, "source")
        const srcset = source ? attrOf(source, "srcset") : ""
        const url = srcset ? bestFromSrcset(srcset, ctx.baseURL) : ""
        if (url) {
          const media = makeMedia({ url, source: "content" })
          ctx.images.push(media)
          pushBlock(ctx, { kind: "image", id: blockID(), media, noise: nodeNoise })
        }
      }
      return
    }
    case "video":
      mediaBlock(ctx, node, "video", nodeNoise)
      return
    case "audio":
      mediaBlock(ctx, node, "audio", nodeNoise)
      return
    case "iframe":
      iframeBlock(ctx, node, nodeNoise)
      return
    case "hr":
      pushBlock(ctx, { kind: "divider", id: blockID(), noise: nodeNoise })
      return
    case "br":
      return
    default:
      break
  }

  // 通用容器：如果直接包含纯文本，就当段落处理
  const hasBlockChild = node.children.some((c) => BLOCK_TAGS.has(c.tag))
  if (!hasBlockChild) {
    const text = inlineText(node)
    if (text) {
      if (text.length <= 120 && isDropPhrase(text)) return
      pushBlock(ctx, { kind: "paragraph", id: blockID(), text, noise: nodeNoise })
      const imgs = node.children.filter((c) => c.tag === "img")
      for (const img of imgs) imageBlock(ctx, img, undefined, nodeNoise)
    } else {
      walkChildren(ctx, node, nodeNoise)
    }
    return
  }
  walkChildren(ctx, node, nodeNoise)
}

function walkChildren(ctx: ExtractContext, node: MNode, noise: boolean) {
  const buffer: string[] = []
  const flush = () => {
    const text = normalizeText(buffer.join(" "))
    buffer.length = 0
    if (text && text.length > 1) pushBlock(ctx, { kind: "paragraph", id: blockID(), text, noise })
  }
  for (const child of node.children) {
    if (BLOCK_TAGS.has(child.tag)) {
      flush()
      visit(ctx, child, noise)
      continue
    }
    if (child.children.some((c) => BLOCK_TAGS.has(c.tag))) {
      flush()
      walkChildren(ctx, child, noise)
      continue
    }
    const text = inlineText(child)
    if (text) buffer.push(text)
  }
  flush()
}

export interface ExtractResult {
  blocks: ContentBlock[]
  images: ArticleMedia[]
  textLength: number
}

export interface ExtractOptions {
  baseURL: string
  title?: string
}

/** HTML → blocks（noise 已标记，调用方决定是否过滤） */
export function extractBlocks(html: string, options: ExtractOptions): ExtractResult {
  const root = parseMarkup(html || "", "html")
  const ctx: ExtractContext = {
    baseURL: options.baseURL,
    title: options.title,
    blocks: [],
    images: [],
    skippedLeadingHeading: false,
  }
  const container = documentRoot(root).body
  walkChildren(ctx, container, false)

  // 去掉连续重复/空块
  const blocks = ctx.blocks.filter((b) => {
    if (b.kind === "paragraph") return !!(b as any).text?.trim()
    return true
  })

  // 文本特征再标一次噪声：阅读模式与原文模式的差别就靠它
  tagContentNoise(blocks, options.baseURL)

  const textLength = blocks.reduce((sum, b) => {
    if (b.noise) return sum
    if (b.kind === "paragraph" || b.kind === "heading") return sum + b.text.length
    if (b.kind === "quote") return sum + b.text.length
    if (b.kind === "code") return sum + b.text.length
    if (b.kind === "list") return sum + b.items.join("").length
    if (b.kind === "table") return sum + b.rows.reduce((rowSum, row) => rowSum + row.join("").length, 0)
    return sum
  }, 0)

  return { blocks, images: ctx.images.filter((m) => !isJunkMedia(m)), textLength }
}

/**
 * 解析管道版本。**修改正文提取 / 噪声识别规则后必须 +1**：
 * 文章只存一份解析结果，旧文章带的是旧规则的结果；不 bump 的话用户打开旧文章时
 * 看不到新规则的差异。store.fullArticle 会据此按需重解析（不需要重新联网）。
 */
export const PIPELINE_VERSION = 2

/** 阅读模式用的块：过滤 noise（全部被过滤时回退到全部块，避免空白） */
export function readerBlocks(blocks: ContentBlock[]): ContentBlock[] {
  let out = blocks.filter((b) => !b.noise)
  if (!out.length) out = blocks
  // 去掉开头/结尾的 divider
  while (out.length && out[0].kind === "divider") out = out.slice(1)
  while (out.length && out[out.length - 1].kind === "divider") out = out.slice(0, -1)
  return out
}

export function blocksToPlainText(blocks: ContentBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    switch (block.kind) {
      case "paragraph":
      case "heading":
        parts.push(block.text)
        break
      case "quote":
        parts.push(`> ${block.text}`)
        break
      case "code":
        parts.push(block.text)
        break
      case "list":
        parts.push(block.items.map((i, idx) => (block.ordered ? `${idx + 1}. ${i}` : `• ${i}`)).join("\n"))
        break
      case "table":
        parts.push(block.rows.map((r) => r.join(" | ")).join("\n"))
        break
      case "image":
        if (block.media.alt) parts.push(`[图片: ${block.media.alt}]`)
        else if (block.media.caption) parts.push(`[图片: ${block.media.caption}]`)
        break
      default:
        break
    }
  }
  return parts.join("\n\n").trim()
}

export function countImages(blocks: ContentBlock[]): number {
  return blocks.filter((b) => b.kind === "image").length
}

// ── 原网页正文解析（readability-lite）─────────────────────────

const POSITIVE_HINT = /(article|post|content|entry|story|body|main|text|markdown|prose|blog)/i
const NEGATIVE_HINT =
  /(comment|sidebar|footer|header|nav|menu|share|social|related|recommend|promo|advert|breadcrumb|subscribe|widget|meta|toolbar|popup|modal|banner)/i

function stripNoiseNodes(node: MNode) {
  node.children = node.children.filter((child) => {
    if (NOISE_TAGS.has(child.tag)) return false
    if (child.tag === "header" || child.tag === "footer") return false
    const marker = `${attrOf(child, "class")} ${attrOf(child, "id")}`
    if (NEGATIVE_HINT.test(marker)) return false
    if (/display\s*:\s*none/i.test(attrOf(child, "style"))) return false
    stripNoiseNodes(child)
    return true
  })
}

function textLengthOf(node: MNode): number {
  return htmlToText(node.text).length
}

function scoreCandidate(node: MNode): number {
  let textLen = 0
  let linkLen = 0
  let paragraphCount = 0
  const scan = (n: MNode, insideLink: boolean) => {
    for (const child of n.children) {
      const isLink = insideLink || child.tag === "a"
      const ownText = child.text.length
      if (child.tag === "p" || child.tag === "li" || child.tag === "blockquote" || child.tag === "pre") {
        const len = textLengthOf(child)
        if (len > 20) {
          paragraphCount++
          textLen += len
          if (isLink) linkLen += len
        }
      } else {
        if (isLink) linkLen += ownText
        else textLen += ownText
      }
      scan(child, isLink)
    }
  }
  scan(node, false)

  if (textLen < 120) return 0
  const marker = `${attrOf(node, "class")} ${attrOf(node, "id")}`
  let score = textLen
  if (POSITIVE_HINT.test(marker)) score += 300
  if (NEGATIVE_HINT.test(marker)) score -= 400
  if (node.tag === "article" || node.tag === "main") score += 250
  if (node.tag === "p") score -= 100
  if (paragraphCount > 0) score += paragraphCount * 20
  const linkRatio = textLen > 0 ? linkLen / textLen : 1
  if (linkRatio > 0.5) score -= textLen * 0.8
  else if (linkRatio > 0.3) score -= textLen * 0.3
  return score
}

export interface WebArticle {
  html: string
  blocks: ContentBlock[]
  images: ArticleMedia[]
  textLength: number
  title?: string
  description?: string
  imageURL?: string
  author?: string
  publishedAt?: number
}

/** 从整页 HTML 里提取正文容器 + OG 元数据 */
export function extractWebArticle(html: string, url: string): WebArticle {
  const root = parseMarkup(html || "", "html")
  const { head, body } = documentRoot(root)

  const metaOf = (key: string): string => {
    for (const node of findAll(head, "meta")) {
      const prop = attrOf(node, "property") || attrOf(node, "name") || attrOf(node, "itemprop")
      if (prop.toLowerCase() === key.toLowerCase()) return attrOf(node, "content")
    }
    return ""
  }

  const imageURL = resolveURL(url, metaOf("og:image") || metaOf("twitter:image") || metaOf("image"))
  const description = metaOf("og:description") || metaOf("description")
  const author = metaOf("author") || metaOf("article:author") || metaOf("og:article:author")
  const publishedRaw = metaOf("article:published_time") || metaOf("datePublished") || metaOf("pubdate")
  const publishedAt = publishedRaw ? new Date(publishedRaw).getTime() : undefined

  let title = metaOf("og:title") || metaOf("twitter:title")
  if (!title) {
    const titleNode = find(head, "title")
    title = titleNode ? titleNode.text.trim() : ""
  }

  stripNoiseNodes(body)

  let best: MNode | undefined
  let bestScore = 0
  const consider = (node: MNode) => {
    if (!["article", "main", "div", "section", "td", "body"].includes(node.tag)) return
    const score = scoreCandidate(node)
    if (score > bestScore) {
      bestScore = score
      best = node
    }
  }
  consider(body)
  const walk = (node: MNode) => {
    for (const child of node.children) {
      consider(child)
      walk(child)
    }
  }
  walk(body)

  const target = best ?? body
  let html2 = serializeNode(target)
  let result = extractBlocks(html2, { baseURL: url, title })

  // 选中的容器内容太少时，回退到整个 body
  if (result.textLength < 200 && target !== body) {
    html2 = serializeNode(body)
    const fallback = extractBlocks(html2, { baseURL: url, title })
    if (fallback.textLength > result.textLength) result = fallback
    else html2 = serializeNode(target)
  }

  return {
    html: html2,
    blocks: result.blocks,
    images: result.images,
    textLength: result.textLength,
    title,
    description,
    imageURL,
    author: author || undefined,
    publishedAt: publishedAt && !isNaN(publishedAt) ? publishedAt : undefined,
  }
}

/** 页面里声明的 feed 地址（<link rel="alternate">） */
export function discoverFeedLinks(html: string, baseURL: string): Array<{ url: string; type: string; title?: string }> {
  const root = parseMarkup(html || "", "html")
  const head = documentRoot(root).head
  const out: Array<{ url: string; type: string; title?: string }> = []
  for (const node of findAll(head, "link")) {
    const rel = (attrOf(node, "rel") || "").toLowerCase()
    const type = (attrOf(node, "type") || "").toLowerCase()
    const href = attrOf(node, "href")
    if (!href) continue
    if (!rel.split(/\s+/).includes("alternate")) continue
    if (
      type.includes("rss") ||
      type.includes("atom") ||
      type.includes("feed+json") ||
      type.includes("xml") ||
      /\.(rss|xml|atom)(\?|$)/i.test(href)
    ) {
      out.push({ url: resolveURL(baseURL, href), type, title: attrOf(node, "title") || undefined })
    }
  }
  return out
}

/** 页面的站点图标候选 */
export function discoverIconLinks(html: string, baseURL: string): string[] {
  const root = parseMarkup(html || "", "html")
  const head = documentRoot(root).head
  const out: string[] = []
  for (const node of findAll(head, "link")) {
    const rel = (attrOf(node, "rel") || "").toLowerCase()
    if (rel.includes("apple-touch-icon") || rel.includes("icon")) {
      const href = attrOf(node, "href")
      if (href) out.push(resolveURL(baseURL, href))
    }
  }
  return out
}

