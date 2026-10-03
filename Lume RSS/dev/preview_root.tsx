/**
 * 冒烟测试：塞入示例数据后渲染根视图（4 个 Tab 一起构建），
 * 用来验证首页 / 订阅 / 收藏 / 设置的渲染路径没有运行时错误。
 * 运行：scripting-ts preview_ui "<项目>/dev/preview_root.tsx"
 */

import "./isolate"
import { Group, useEffect } from "scripting"
import type { Article, Feed, Folder } from "../models"
import { providerTemplate } from "../models"
import { store } from "../lib/store"
import { uid } from "../lib/utils"
import { RootView } from "../ui/root"

function makeArticle(feed: Feed, index: number, withImage: boolean, withAI: boolean): Article {
  const blocks: Article["blocks"] = [
    { kind: "paragraph", id: uid("b-"), text: "这是预览用的正文段落，用来验证列表与详情页的渲染。".repeat(3), noise: false },
  ]
  return {
    id: `a-preview-${index}`,
    feedID: feed.id,
    dedupeKey: `preview-${index}`,
    title: withImage
      ? `带有主图的文章 #${index}：Apple announces a completely new approach to reading`
      : `纯文字文章 #${index}：关于 RSS 阅读体验的一些想法`,
    author: "Jane Doe",
    url: "https://example.com/post",
    publishedAt: Date.now() - index * 3600_000,
    updatedAt: Date.now() - index * 3600_000,
    summary: "摘要文字用于验证列表中的次级信息层级，最多显示三行。".repeat(2),
    blocks,
    htmlContent: "",
    images: withImage
      ? [{ id: uid("m-"), type: "image", url: `https://picsum.photos/seed/lume${index}/1200/800`, source: "content" }]
      : [],
    categories: ["Apple"],
    state: index % 3 === 0 ? "read" : "unread",
    isFavorite: index === 1,
    isLater: index === 2,
    progress: { percent: index === 1 ? 0.42 : 0, updatedAt: Date.now() },
    createdAt: Date.now(),
    contentSource: "feed-full",
    contentFetched: true,
    aiSummary: withAI
      ? {
          oneLine: "Apple 正在用一套新的硬件与软件组合重新定义移动设备的边界。",
          points: ["A17 Pro 采用 3nm 工艺", "GPU 支持硬件光追", "售价不变"],
          data: ["A17 Pro", "3nm", "999 美元"],
          providerID: "deepseek",
          providerName: "DeepSeek",
          model: "deepseek-chat",
          createdAt: Date.now(),
          chunks: 1,
          contentHash: "x",
        }
      : undefined,
    readingMinutes: 8,
  }
}

function seed() {
  if (store.feeds.length) return
  const folder: Folder = { id: "folder-tech", name: "科技", sortOrder: 0 }
  store.folders.push(folder)
  const theVerge: Feed = {
    id: "feed-verge",
    title: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    siteURL: "https://www.theverge.com",
    description: "Tech news",
    iconURL: "https://www.google.com/s2/favicons?domain=theverge.com&sz=128",
    folderID: folder.id,
    unreadCount: 12,
    isMuted: false,
    sortOrder: 0,
    lastUpdated: Date.now() - 3600_000,
    lastSuccessAt: Date.now() - 3600_000,
  }
  const hn: Feed = {
    id: "feed-hn",
    title: "Hacker News",
    url: "https://hnrss.org/frontpage",
    siteURL: "https://news.ycombinator.com",
    description: "Links for hackers",
    unreadCount: 3,
    isMuted: false,
    sortOrder: 1,
    lastError: "网络连接失败，请检查网络后重试",
    lastErrorAt: Date.now(),
  }
  store.feeds.push(theVerge, hn)
  store.providers.push(
    { ...providerTemplate("deepseek"), apiKey: "sk-preview", model: "deepseek-chat" },
    providerTemplate("openai"),
    providerTemplate("custom")
  )
  store.settings.activeProviderID = "deepseek"
  store.settings.defaultModel = "deepseek-chat"
  for (let i = 0; i < 6; i++) {
    const article = makeArticle(i % 2 === 0 ? theVerge : hn, i, i % 2 === 0, i === 1)
    store.articles.push(article)
    if (article.isFavorite || article.isLater) {
      store.saved.push({
        ...article,
        savedAt: Date.now(),
        feedTitle: store.feeds.find((f) => f.id === article.feedID)?.title ?? "",
        feedSiteURL: "https://example.com",
      })
    }
  }
  store.loaded = true
}

seed()

export default function View() {
  useEffect(() => {
    console.log("[preview] feeds =", store.feeds.length, "articles =", store.articles.length, "saved =", store.saved.length)
  }, [])
  return (
    <Group>
      <RootView />
    </Group>
  )
}
