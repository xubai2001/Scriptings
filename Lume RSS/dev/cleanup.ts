/**
 * 一次性清理：把开发脚本早期误写进**真实数据目录**的示例数据删掉。
 *
 * 运行：scripting-ts run "<项目>/dev/cleanup.ts"
 *
 * 注意：这个脚本故意 **不** import "./isolate"，它就是要操作真实数据。
 * 清理对象是当时预览脚本种下的固定 id：
 *   feed-verge / feed-hn / feed-preview  → 示例订阅
 *   folder-tech                          → 示例文件夹
 *   a-preview-*                          → 示例收藏
 * 顺带把「已取消订阅的 feed 留下的文章文件」也一起清掉。
 */

import { Script } from "scripting"
import { store } from "../lib/store"
import { ARTICLES_DIR, deletePath, listDirectory } from "../lib/persist"

const TEST_FEED_IDS = ["feed-verge", "feed-hn", "feed-preview", "probe", "probe-sspai", "probe-web"]
const TEST_FOLDER_IDS = ["folder-tech"]
const TEST_ARTICLE_PREFIX = "a-preview"

async function run() {
  await store.load()

  console.log(
    `清理前：feeds=${store.feeds.length} folders=${store.folders.length} articles=${store.articles.length} saved=${store.saved.length}`
  )
  for (const feed of store.feeds) console.log(`   · feed ${feed.id} — ${feed.title}`)

  if (!store.feeds.length) {
    console.log("⚠️ 没读到任何订阅，出于安全考虑中止（避免把空状态写回）")
    Script.exit("aborted")
    return
  }

  const beforeFeeds = store.feeds.length

  for (const feedID of TEST_FEED_IDS) {
    if (store.feeds.some((feed) => feed.id === feedID)) {
      console.log(`删除示例订阅 ${feedID}`)
      await store.removeFeed(feedID)
    }
  }

  for (const folderID of TEST_FOLDER_IDS) {
    const used = store.feeds.some((feed) => feed.folderID === folderID)
    if (!used && store.folders.some((folder) => folder.id === folderID)) {
      console.log(`删除示例文件夹 ${folderID}`)
      store.folders = store.folders.filter((folder) => folder.id !== folderID)
    }
  }

  const keptSaved = store.saved.filter(
    (article) => !TEST_FEED_IDS.includes(article.feedID) && !article.id.startsWith(TEST_ARTICLE_PREFIX)
  )
  if (keptSaved.length !== store.saved.length) {
    console.log(`删除示例收藏 ${store.saved.length - keptSaved.length} 篇`)
    store.saved = keptSaved
  }

  const known = new Set(store.feeds.map((feed) => feed.id))
  for (const file of await listDirectory(ARTICLES_DIR)) {
    if (!file.endsWith(".json")) continue
    const feedID = file.slice(0, -5)
    if (!known.has(feedID)) {
      console.log(`删除孤儿文章文件 ${file}`)
      await deletePath(`${ARTICLES_DIR}/${file}`)
    }
  }

  await store.flush()

  console.log(
    `清理后：feeds=${store.feeds.length}（删了 ${beforeFeeds - store.feeds.length} 个）folders=${store.folders.length} articles=${store.articles.length} saved=${store.saved.length}`
  )
  for (const feed of store.feeds) console.log(`   ✅ 保留 ${feed.title} — ${feed.url}`)

  Script.exit("cleanup done")
}

run()
