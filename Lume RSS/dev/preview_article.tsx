/**
 * 冒烟测试：往 store 里塞一篇「构造出来的文章」，直接渲染文章详情页，
 * 用来验证正文块渲染 / 工具栏 / 图片查看器挂载是否正常（不需要联网）。
 * 运行：scripting-ts preview_ui "<项目>/dev/preview_article.tsx"
 */

import "./isolate"
import { Group, useEffect } from "scripting"
import type { SavedArticle } from "../models"
import { extractBlocks } from "../lib/content"
import { store } from "../lib/store"
import { estimateReadingMinutes, uid } from "../lib/utils"
import { ArticlePage } from "../ui/article"

const FEED_ID = "feed-preview"

const HTML = `
<div>
  <p>第一段正文。这里是一段足够长的文字，用来验证段落排版、行距与阅读宽度的限制是否生效。</p>
  <h2>小标题</h2>
  <p>第二段正文，包含一个<a href="https://example.com">链接</a>与一些<b>加粗</b>文字。</p>
  <figure>
    <img src="https://cdnfile.sspai.com/2026/09/12/32887265aa63018a36fa7df7238c8481.jpg?imageView2/2/w/1120/q/90/interlace/1/ignore-error/1" width="1120" height="747" />
    <figcaption>少数派图床（本地缓存后渲染）</figcaption>
  </figure>
  <figure>
    <img src="https://picsum.photos/seed/lumewide/3000/400" width="3000" height="400" />
    <figcaption>超宽封面图 3000×400（用来验证不会把整页撞宽）</figcaption>
  </figure>
  <ul><li>列表项一</li><li>列表项二</li></ul>
  <blockquote>这是一段引用文字。<cite>来源</cite></blockquote>
  <pre><code class="language-swift">let lume = "reader"</code></pre>
  <table><tr><th>型号</th><th>参数</th></tr><tr><td>A17 Pro</td><td>3nm</td></tr></table>
  <hr />
  <p>最后一段正文。</p>
  <div class="share-buttons"><p>Share on Twitter</p></div>
  <p>简单、好用、，少数派为你呈现 🚀专注的写作软件</p>
  <p>特惠、好用的硬件产品，尽在 🛒少数派 sspai 官方店铺</p>
  <p>6位派友已充电</p>
</div>
`

const ARTICLE_ID = "a-preview"

function seed() {
  if (store.saved.some((a) => a.id === ARTICLE_ID)) return
  const extracted = extractBlocks(HTML, { baseURL: "https://example.com/post", title: "预览文章标题" })
  // 必须存全部块（包括 noise），否则就看不到「阅读模式 / 原文模式」的差别
  const blocks = extracted.blocks
  const article: SavedArticle = {
    id: ARTICLE_ID,
    feedID: FEED_ID,
    dedupeKey: "preview",
    title: "预览文章标题：Apple announces a completely new approach",
    author: "Jane Doe",
    url: "https://example.com/post",
    publishedAt: Date.now() - 7200_000,
    updatedAt: Date.now() - 7200_000,
    summary: "这是列表里显示的摘要文字。",
    blocks,
    htmlContent: HTML,
    images: extracted.images,
    categories: ["Apple", "Chip"],
    state: "unread",
    isFavorite: true,
    isLater: false,
    progress: { percent: 0.42, blockID: blocks[2]?.id, updatedAt: Date.now() },
    createdAt: Date.now(),
    contentSource: "feed-full",
    contentFetched: true,
    readingMinutes: estimateReadingMinutes("x".repeat(400)),
    savedAt: Date.now(),
    feedTitle: "The Verge",
    feedSiteURL: "https://example.com",
  }
  store.feeds.push({
    id: FEED_ID,
    title: "The Verge",
    url: "https://example.com/feed",
    siteURL: "https://example.com",
    description: "预览用订阅源",
    unreadCount: 1,
    isMuted: false,
    sortOrder: 0,
  })
  store.saved.push(article)
  store.articles.push(article)
  store.loaded = true
}

seed()

export default function View() {
  // 默认渲染「原文模式」，方便用截图检查与阅读模式的差异
  store.settings.readingMode = "original"
  // 字体：标题用自定义字体族，正文用系统衬线，方便截图对照
  store.settings.titleFont = { design: "default", family: "Georgia" }
  store.settings.bodyFont = { design: "serif", family: "" }
  useEffect(() => {
    console.log("[preview] 文章块数量 =", store.saved[0]?.blocks.length)
    console.log("[preview] 分类 =", JSON.stringify(store.saved[0]?.blocks.map((b) => b.kind)))
  }, [])
  return (
    <Group>
      <ArticlePage articleID={ARTICLE_ID} />
    </Group>
  )
}
