/**
 * 联网自检：用真实订阅源验证 fetch → parse → media 提取 → 发现。
 * 运行：scripting-ts run "<项目>/dev/netcheck.ts"
 */

import "./isolate"
import { Script } from "scripting"
import { fetchAndParseFeed, fetchText, upgradeArticleContent } from "../lib/refresh"
import { discoverFeeds } from "../lib/discovery"
import { heroImage } from "../lib/media"
import { extractWebArticle } from "../lib/content"
import { store } from "../lib/store"

const FEEDS = ["https://hnrss.org/frontpage", "https://daringfireball.net/feeds/main"]

async function run() {
  for (const url of FEEDS) {
    try {
      const parsed = await fetchAndParseFeed(url)
      const first = parsed.items[0]
      console.log(
        `✅ ${url}\n   title=${parsed.meta.title} type=${parsed.meta.feedType} site=${parsed.meta.siteURL}\n   items=${parsed.items.length} 首条=${String(first?.title).slice(0, 40)} 媒体=${first?.images.length} 正文长度=${first?.htmlContent.length}`
      )
      if (first) {
        const article = store.buildArticle({
          feedID: "probe",
          dedupeKey: "probe",
          title: first.title,
          url: first.url,
          author: first.author,
          publishedAt: first.publishedAt,
          updatedAt: first.updatedAt,
          summary: first.summary,
          htmlContent: first.htmlContent,
          images: first.images,
          categories: first.categories,
        })
        console.log(
          `   块=${article.blocks.map((b) => b.kind).join(",")} 主图=${heroImage(article.images)?.url ?? "无"} 来源=${article.contentSource}`
        )
      }
    } catch (error) {
      console.log(`❌ ${url} — ${String((error as Error)?.message ?? error)}`)
    }
  }

  try {
    const discovery = await discoverFeeds("https://www.theverge.com")
    console.log(`✅ 发现 ${discovery.feeds.length} 个订阅源: ${discovery.feeds.map((f) => `${f.type} ${f.url}`).join(" | ")}`)
  } catch (error) {
    console.log(`❌ 发现失败 — ${String((error as Error)?.message ?? error)}`)
  }

  // 原网页正文解析（真实网页）
  for (const page of ["https://news.ycombinator.com/", "https://daringfireball.net/"]) {
    try {
      const result = await fetchText(page, { accept: "text/html" })
      const web = extractWebArticle(result.text, page)
      const firstParagraph = web.blocks.find((b) => b.kind === "paragraph")
      console.log(
        `✅ 网页正文 ${page}\n   块=${web.blocks.length} 文本长度=${web.textLength} og图=${web.imageURL || "无"}\n   首段=${String(firstParagraph && "text" in firstParagraph ? firstParagraph.text : "").slice(0, 60)}`
      )
    } catch (error) {
      console.log(`❌ 网页正文 ${page} — ${String((error as Error)?.message ?? error)}`)
    }
  }

  Script.exit("net done")
}

void upgradeArticleContent
run()
