/**
 * 阅读模式 vs 原文模式：在真实订阅源上统计「被识别为无关内容(noise)的块」有多少。
 * 运行：scripting-ts run "<项目>/dev/modecheck.ts"
 */

import "./isolate"
import { Script } from "scripting"
import { fetchAndParseFeed, fetchText } from "../lib/refresh"
import { extractWebArticle, readerBlocks } from "../lib/content"
import { store } from "../lib/store"

const FEEDS = [
  "https://hnrss.org/frontpage",
  "https://daringfireball.net/feeds/main",
  "https://sspai.com/feed",
  "https://www.theverge.com/rss/index.xml",
]

function snippet(text: string, max = 70): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? flat.slice(0, max) + "…" : flat
}

function report(label: string, blocks: Array<{ kind: string; noise: boolean } & Record<string, unknown>>) {
  const noise = blocks.filter((b) => b.noise)
  const reader = readerBlocks(blocks as never)
  console.log(
    `${label}\n   全部块=${blocks.length}（阅读模式保留 ${reader.length}） 被判断为无关=${noise.length} 差异=${
      noise.length > 0 ? "★可见" : "无"
    }`
  )
  for (const block of noise.slice(0, 6)) {
    const listText = ((block as { items?: string[] }).items ?? []).join(" / ")
    const text = (block.text as string) ?? listText
    console.log(`      · [${block.kind}] ${snippet(String(text))}`)
  }
}

function dump(blocks: Array<{ kind: string; noise: boolean } & Record<string, unknown>>) {
  blocks.forEach((block, index) => {
    const listText = ((block as { items?: string[] }).items ?? []).join(" | ")
    const cellText = ((block as { rows?: string[][] }).rows ?? []).map((r) => r.join("/")).join(" | ")
    const text = String((block.text as string) ?? listText ?? cellText ?? "")
    console.log(`      ${String(index).padStart(3, " ")} [${block.kind}${block.noise ? "/NOISE" : ""}] ${snippet(text, 90)}`)
  })
}

async function run() {
  for (const url of FEEDS) {
    try {
      const parsed = await fetchAndParseFeed(url)
      const item = parsed.items.find((i) => i.htmlContent.length > 1200) ?? parsed.items[0]
      if (!item) continue
      console.log(`\n=== ${parsed.meta.title} ===`)
      console.log(`首条：${snippet(item.title, 50)}（feed 正文 ${item.htmlContent.length} 字）`)

      const fromFeed = store.buildArticle({
        feedID: "probe",
        dedupeKey: "probe",
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt,
        updatedAt: item.updatedAt,
        summary: item.summary,
        htmlContent: item.htmlContent,
        images: item.images,
        categories: item.categories,
      })
      report("  · feed 内容", fromFeed.blocks)

      if (fromFeed.contentSource === "feed-summary") {
        const page = await fetchText(item.url, { accept: "text/html" })
        const web = extractWebArticle(page.text, item.url)
        const webArticle = store.buildArticle({
          feedID: "probe",
          dedupeKey: "probe-web",
          title: web.title || item.title,
          url: item.url,
          publishedAt: item.publishedAt,
          updatedAt: item.updatedAt,
          summary: "",
          htmlContent: web.html,
          images: web.images,
          categories: [],
        })
        report("  · 原网页内容", webArticle.blocks)
        if (parsed.meta.title.includes("少数派")) dump(webArticle.blocks)
      }
    } catch (error) {
      console.log(`❌ ${url} — ${String((error as Error)?.message ?? error)}`)
    }
  }

  Script.exit("modecheck done")
}

run()
