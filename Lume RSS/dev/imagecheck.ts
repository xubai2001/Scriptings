/**
 * 图片专项自检：sspai（少数派）feed 的图片 URL 形态 + 实际下载。
 * 运行：scripting-ts run "<项目>/dev/imagecheck.ts"
 */

import "./isolate"
import { Script } from "scripting"
import { fetchAndParseFeed, fetchText } from "../lib/refresh"
import { extractBlocks } from "../lib/content"
import { heroImage } from "../lib/media"
import { cacheImage, localImagePath, downloadImage } from "../lib/image_cache"
import { exists } from "../lib/persist"
import { store } from "../lib/store"

async function run() {
  const parsed = await fetchAndParseFeed("https://sspai.com/feed")
  console.log(`源: ${parsed.meta.title} / items=${parsed.items.length}`)
  const first = parsed.items[0]
  console.log(`首条: ${first?.title}`)
  console.log(`htmlContent 长度=${first?.htmlContent.length}`)
  console.log("--- 前 600 字原始 HTML ---")
  console.log(String(first?.htmlContent).slice(0, 600))

  const article = store.buildArticle({
    feedID: "probe-sspai",
    dedupeKey: "probe-sspai",
    title: first.title,
    url: first.url,
    publishedAt: first.publishedAt,
    updatedAt: first.updatedAt,
    summary: first.summary,
    htmlContent: first.htmlContent,
    images: first.images,
    categories: first.categories,
  })
  console.log("--- 解析结果 ---")
  console.log(`images = ${JSON.stringify(article.images.map((m) => m.url))}`)
  console.log(
    `块 = ${article.blocks.map((b) => (b.kind === "image" ? `image(${b.media.url})` : b.kind)).join(" | ")}`
  )
  console.log(`主图 = ${heroImage(article.images)?.url ?? "无"}`)

  const candidates: string[] = []
  try {
    const page = await fetchText(first.url, { accept: "text/html" })
    const blocks = extractBlocks(page.text, { baseURL: first.url, title: first.title })
    console.log(`原网页图片候选 = ${JSON.stringify(blocks.images.slice(0, 3).map((m) => m.url))}`)
    candidates.push(...blocks.images.map((m) => m.url))
  } catch (error) {
    console.log(`原网页抓取失败: ${String(error)}`)
  }

  for (const url of Array.from(new Set(candidates)).slice(0, 3)) {
    const data = await downloadImage(url)
    const path = await cacheImage(url)
    console.log(
      `下载 ${url}\n   data=${data ? "ok" : "失败"} 缓存=${path ? "ok" : "失败"} 存在=${path ? exists(path) : false}\n   期望路径=${localImagePath(url)}`
    )
  }

  Script.exit("imagecheck done")
}

run()
