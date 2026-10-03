/**
 * 存储 / 解析版本专项自检（跑在隔离目录 lume-dev 里，不会污染真实数据）：
 *   1. buildArticle 必须保存**全部**块（含 noise），否则两种阅读模式没区别；
 *   2. 旧文章（没有 pipelineVersion）在 fullArticle 时要用新规则重解析。
 * 运行：scripting-ts run "<项目>/dev/storecheck.ts"
 */

import "./isolate"
import { Script } from "scripting"
// 允许写入（但目录已被 isolate 换到 lume-dev）
;(globalThis as { __LUME_NO_WRITE__?: boolean }).__LUME_NO_WRITE__ = false

import type { Feed } from "../models"
import { PIPELINE_VERSION, readerBlocks } from "../lib/content"
import { store } from "../lib/store"
import { uid } from "../lib/utils"

const HTML = `<div>
  <p>${"这是一段真正的正文，讲的是某个产品在长期使用后的真实体验，长度足够，应该被当作正文保留。".repeat(2)}</p>
  <p>${"第二段继续展开。".repeat(12)}</p>
  <p>关注我们</p>
  <p>简单、好用、，少数派为你呈现 🚀专注的写作软件</p>
  <p>6位派友已充电</p>
</div>`

function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`)
}

async function run() {
  const feed: Feed = {
    id: uid("feed-dev-"),
    title: "dev feed",
    url: "https://sspai.com/feed",
    siteURL: "https://sspai.com",
    description: "",
    unreadCount: 0,
    isMuted: false,
    sortOrder: 0,
  }
  store.addFeedData(feed)

  const article = store.buildArticle({
    feedID: feed.id,
    dedupeKey: "dev-1",
    title: "dev article",
    url: "https://sspai.com/post/1",
    publishedAt: Date.now(),
    updatedAt: Date.now(),
    summary: "",
    htmlContent: HTML,
    images: [],
    categories: [],
  })
  const noise = article.blocks.filter((b) => b.noise)
  console.log(`buildArticle：blocks=${article.blocks.length} noise=${noise.length} reading=${readerBlocks(article.blocks).length}`)
  for (const block of noise) console.log(`   · noise: ${String((block as { text?: string }).text).slice(0, 30)}`)
  check("保存了全部块（含 noise）", noise.length > 0 && article.pipelineVersion === PIPELINE_VERSION)
  check("阅读模式比原文短", readerBlocks(article.blocks).length < article.blocks.length)

  await store.saveFeedArticles(feed.id, [article])

  // 伪造一篇「旧规则解析出来的文章」：去掉 pipelineVersion，只留过滤后的块
  const legacy = { ...article, pipelineVersion: undefined, blocks: readerBlocks(article.blocks) }
  await store.saveFeedArticles(feed.id, [legacy as typeof article])
  store.dropCaches()
  store.articles = store.articles.map((a) => (a.id === article.id ? { ...a, blocks: [] } : a))

  const reloaded = await store.fullArticle(article.id)
  const reloadedNoise = reloaded?.blocks.filter((b) => b.noise).length ?? 0
  console.log(`fullArticle 重解析后：blocks=${reloaded?.blocks.length} noise=${reloadedNoise} version=${reloaded?.pipelineVersion}`)
  check("旧文章被按新规则重解析", reloadedNoise > 0 && reloaded?.pipelineVersion === PIPELINE_VERSION)

  // 再读一次应该走缓存，不再重解析
  const again = await store.fullArticle(article.id)
  check("第二次读取走缓存", again === reloaded)

  Script.exit("storecheck done")
}

run()
