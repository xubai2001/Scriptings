/**
 * OPML 导入 / 导出。
 */

import type { Feed, Folder } from "../models"
import { parseMarkup, find, findAll, attrOf, MNode } from "./markup"
import { escapeHTML } from "./utils"

export interface OPMLOutline {
  title: string
  url: string
  siteURL?: string
  folder?: string
}

export function buildOPML(feeds: Feed[], folders: Folder[]): string {
  const byFolder = new Map<string, Feed[]>()
  const loose: Feed[] = []
  for (const feed of feeds) {
    if (feed.folderID) {
      const list = byFolder.get(feed.folderID) ?? []
      list.push(feed)
      byFolder.set(feed.folderID, list)
    } else {
      loose.push(feed)
    }
  }

  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<opml version="2.0">')
  lines.push("  <head>")
  lines.push("    <title>Lume RSS 订阅</title>")
  lines.push(`    <dateCreated>${new Date().toUTCString()}</dateCreated>`)
  lines.push("  </head>")
  lines.push("  <body>")

  const outlineOf = (feed: Feed, indent: string) =>
    `${indent}<outline type="rss" text="${escapeHTML(feed.title)}" title="${escapeHTML(feed.title)}" xmlUrl="${escapeHTML(
      feed.url
    )}" htmlUrl="${escapeHTML(feed.siteURL)}"/>`

  for (const feed of loose) lines.push(outlineOf(feed, "    "))
  for (const folder of folders) {
    const list = byFolder.get(folder.id)
    if (!list || !list.length) continue
    lines.push(`    <outline text="${escapeHTML(folder.name)}" title="${escapeHTML(folder.name)}">`)
    for (const feed of list) lines.push(outlineOf(feed, "      "))
    lines.push("    </outline>")
  }

  lines.push("  </body>")
  lines.push("</opml>")
  return lines.join("\n")
}

function walkOutline(node: MNode, folder: string | undefined, out: OPMLOutline[]) {
  for (const child of node.children) {
    if (child.tag !== "outline") {
      // 容忍 <?xml?> 之类的包裹
      walkOutline(child, folder, out)
      continue
    }
    const xmlUrl = attrOf(child, "xmlurl")
    const title = attrOf(child, "title") || attrOf(child, "text")
    const htmlUrl = attrOf(child, "htmlurl")
    if (xmlUrl) {
      out.push({ title: title || xmlUrl, url: xmlUrl, siteURL: htmlUrl || undefined, folder })
    } else {
      walkOutline(child, title || folder, out)
    }
  }
}

export function parseOPML(xml: string): OPMLOutline[] {
  const root = parseMarkup(xml || "")
  const opml = find(root, "opml")
  const body = (opml ? find(opml, "body") : undefined) ?? find(root, "body") ?? root
  const out: OPMLOutline[] = []
  walkOutline(body, undefined, out)
  const seen = new Set<string>()
  return out.filter((item) => {
    if (!item.url || seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
}
