/**
 * 一个容错的标记解析器（同时用于 XML feed 与不规范的 HTML 正文）。
 *
 * 平台没有 DOMParser，所以这里自己实现：标签/属性解析、CDATA、注释、
 * 自闭合、void 元素、script/style 原文、隐式闭合的容错。
 */

import { decodeEntities } from "./utils"

export interface MNode {
  /** 小写本地标签名，根节点为 "#root" */
  tag: string
  /** 原始标签名（保留命名空间前缀，如 media:content） */
  rawTag: string
  /** 属性名统一小写（保留前缀） */
  attrs: Record<string, string>
  children: MNode[]
  text: string
  parent?: MNode
}

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
])

const RAW_TEXT_TAGS = new Set(["script", "style"])

/**
 * 这几个标签在 HTML 里是自闭合元素，但在 RSS / Atom / OPML 里是带结束标签的元素，
 * 例如 RSS 的 `<link>https://…</link>`、Atom 的 `<link href="…"/>`。
 */
const XML_CONTAINER_TAGS = new Set(["link", "meta", "base"])

function localName(raw: string): string {
  const idx = raw.indexOf(":")
  return (idx >= 0 ? raw.slice(idx + 1) : raw).trim().toLowerCase()
}

function appendText(node: MNode, text: string) {
  if (!text) return
  node.text += decodeEntities(text)
}

/** 找到从 lt 开始的标签结束位置（考虑引号），返回 '>' 的下标，找不到返回 -1 */
function findTagEnd(input: string, lt: number): number {
  let i = lt + 1
  let quote: string | null = null
  while (i < input.length) {
    const ch = input[i]
    if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === ">") {
      return i
    }
    i++
  }
  return -1
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([^\s=/>]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const name = m[1].toLowerCase()
    if (!name || name === "/") continue
    const value = m[3] ?? m[4] ?? m[5] ?? ""
    if (attrs[name] === undefined) attrs[name] = decodeEntities(value)
  }
  return attrs
}

function closeTag(stack: MNode[], name: string) {
  for (let i = stack.length - 1; i >= 1; i--) {
    if (stack[i].tag === name || stack[i].rawTag === name) {
      stack.length = i
      return
    }
  }
  // 找不到匹配的开标签：忽略这个闭合标签
}

/** 解析标记文本，返回根节点。mode="xml" 用于 feed/OPML，mode="html" 用于网页正文。 */
export function parseMarkup(input: string, mode: "xml" | "html" = "xml"): MNode {
  const root: MNode = { tag: "#root", rawTag: "#root", attrs: {}, children: [], text: "" }
  if (!input) return root
  const stack: MNode[] = [root]
  const n = input.length
  let i = 0

  while (i < n) {
    const lt = input.indexOf("<", i)
    const current = stack[stack.length - 1]
    if (lt < 0) {
      appendText(current, input.slice(i))
      break
    }
    if (lt > i) appendText(current, input.slice(i, lt))

    if (input.startsWith("<!--", lt)) {
      const end = input.indexOf("-->", lt + 4)
      i = end < 0 ? n : end + 3
      continue
    }
    if (input.startsWith("<![CDATA[", lt)) {
      const end = input.indexOf("]]>", lt + 9)
      const text = input.slice(lt + 9, end < 0 ? n : end)
      stack[stack.length - 1].text += text
      i = end < 0 ? n : end + 3
      continue
    }
    if (input.startsWith("<!", lt) || input.startsWith("<?", lt)) {
      const end = findTagEnd(input, lt)
      i = end < 0 ? n : end + 1
      continue
    }
    if (input.startsWith("</", lt)) {
      const end = input.indexOf(">", lt)
      const raw = input.slice(lt + 2, end < 0 ? n : end).trim()
      closeTag(stack, raw.toLowerCase())
      i = end < 0 ? n : end + 1
      continue
    }

    const end = findTagEnd(input, lt)
    if (end < 0) {
      appendText(current, input.slice(lt))
      break
    }
    const inner = input.slice(lt + 1, end)
    if (!inner.trim()) {
      i = end + 1
      continue
    }
    const spaceIdx = inner.search(/[\s/]/)
    const rawTag = (spaceIdx < 0 ? inner : inner.slice(0, spaceIdx)).trim()
    if (!rawTag) {
      i = end + 1
      continue
    }
    const attrRaw = spaceIdx < 0 ? "" : inner.slice(spaceIdx)
    const selfClosing =
      inner.endsWith("/") ||
      (VOID_TAGS.has(localName(rawTag)) && !(mode === "xml" && XML_CONTAINER_TAGS.has(localName(rawTag))))

    const node: MNode = {
      tag: localName(rawTag),
      rawTag: rawTag.toLowerCase(),
      attrs: parseAttrs(attrRaw),
      children: [],
      text: "",
      parent: stack[stack.length - 1],
    }
    stack[stack.length - 1].children.push(node)
    i = end + 1

    if (selfClosing) continue

    if (RAW_TEXT_TAGS.has(node.tag)) {
      const closer = new RegExp(`</\\s*${node.tag}\\s*>`, "i")
      const rest = input.slice(i)
      const m = closer.exec(rest)
      if (m) {
        node.text += rest.slice(0, m.index)
        i += m.index + m[0].length
      } else {
        node.text += rest
        i = n
      }
      continue
    }

    stack.push(node)
  }

  return root
}

/** 定位 <html> / <head> / <body>（容忍没有 html 包裹的片段） */
export function documentRoot(root: MNode): { html: MNode; head: MNode; body: MNode } {
  const html = find(root, "html") ?? root
  const head = find(html, "head") ?? (html === root ? find(root, "head") : undefined) ?? root
  const body = find(html, "body") ?? html
  return { html, head, body }
}

// ── 查询助手 ─────────────────────────────────────────────────

export function find(node: MNode, tag: string): MNode | undefined {
  const want = tag.toLowerCase()
  const full = want.indexOf(":") >= 0
  for (const child of node.children) {
    if (full ? child.rawTag === want : child.tag === want) return child
  }
  return undefined
}

export function findAll(node: MNode, tag: string): MNode[] {
  const want = tag.toLowerCase()
  const full = want.indexOf(":") >= 0
  return node.children.filter((c) => (full ? c.rawTag === want : c.tag === want))
}

/** 深度优先收集所有同标签后代（表格的 tr 常常被 tbody 包住） */
export function findAllDeep(node: MNode, tag: string): MNode[] {
  const want = tag.toLowerCase()
  const full = want.indexOf(":") >= 0
  const out: MNode[] = []
  const walk = (current: MNode) => {
    for (const child of current.children) {
      if (full ? child.rawTag === want : child.tag === want) out.push(child)
      walk(child)
    }
  }
  walk(node)
  return out
}

/** 深度优先查找（不区分命名空间前缀） */
export function findDeep(node: MNode, tag: string): MNode | undefined {
  const want = tag.toLowerCase()
  for (const child of node.children) {
    if (child.tag === want || child.rawTag === want) return child
    const nested = findDeep(child, want)
    if (nested) return nested
  }
  return undefined
}

export function attrOf(node: MNode | undefined, name: string): string {
  if (!node) return ""
  const want = name.toLowerCase()
  if (node.attrs[want] !== undefined) return node.attrs[want]
  for (const key of Object.keys(node.attrs)) {
    if (key === want || key.endsWith(":" + want)) return node.attrs[key]
  }
  return ""
}

export function nodeText(node: MNode | undefined): string {
  if (!node) return ""
  return (node.text || "").trim()
}

/** 先看子节点文本，再回退到属性（Atom 的 link/author 常用属性） */
export function textOrAttr(node: MNode | undefined, attrName: string): string {
  if (!node) return ""
  const text = nodeText(node)
  if (text) return text
  return attrOf(node, attrName)
}

/** 节点的内部 HTML（自己拼回来，用于把 feed 内容交给 HTML 解析层） */
export function innerHTML(node: MNode): string {
  let out = node.text
  for (const child of node.children) out += outerHTML(child)
  return out
}

const VOID_FOR_SERIALIZE = VOID_TAGS

export function outerHTML(node: MNode): string {
  if (node.tag === "#root") return innerHTML(node)
  const attrs = Object.keys(node.attrs)
    .map((k) => ` ${k}="${node.attrs[k].replace(/"/g, "&quot;")}"`)
    .join("")
  if (VOID_FOR_SERIALIZE.has(node.tag)) return `<${node.tag}${attrs}>`
  return `<${node.tag}${attrs}>${innerHTML(node)}</${node.tag}>`
}

/** 收集所有后代（含自身子树）的文本 */
export function collectText(node: MNode): string {
  let out = node.text
  for (const child of node.children) out += collectText(child)
  return out
}
