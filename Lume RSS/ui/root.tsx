/**
 * 根视图：4 个 Tab（首页 / 订阅 / 收藏 / 设置）。
 * 不增加第五个 AI Tab —— AI 是阅读能力，不是独立的信息来源。
 */

import { Group, Navigation, Script, Tab, TabView, useObservable, useEffect, useState } from "scripting"
import { cacheImages } from "../lib/image_cache"
import { refreshAllFeeds } from "../lib/refresh"
import { store, useStoreVersion } from "../lib/store"
import { AddFeedPage } from "./add_feed"
import { FavoritesPage } from "./favorites"
import { HomePage } from "./home"
import { SettingsPage } from "./settings"
import { SubscriptionsPage } from "./subscriptions"

function intervalMs(value: string): number {
  switch (value) {
    case "30m":
      return 30 * 60 * 1000
    case "1h":
      return 60 * 60 * 1000
    case "3h":
      return 3 * 60 * 60 * 1000
    case "6h":
      return 6 * 60 * 60 * 1000
    default:
      return 0
  }
}

export function RootView() {
  useStoreVersion()
  const selection = useObservable(0)
  const [addFeedOpen, setAddFeedOpen] = useState(false)

  // 全屏模态下的退出：先落盘，再关闭模态（关闭后 index.tsx 会结束脚本）
  let dismiss: ((result?: any) => void) | null = null
  try {
    dismiss = Navigation.useDismiss()
  } catch {
    dismiss = null
  }

  const exitApp = () => {
    const close = dismiss
    void (async () => {
      try {
        await store.flush()
      } catch {
        // 落盘失败也不能把用户困在 App 里
      }
      if (close) {
        close(null)
        // 万一 dismiss 没有传回 index.tsx，兜底退出
        setTimeout(() => Script.exit(), 1500)
      } else {
        Script.exit()
      }
    })()
  }

  // 启动刷新一次；之后按设置用递归 setTimeout 在前台定时刷新（不做后台常驻轮询）
  useEffect(() => {
    void (async () => {
      if (store.feeds.length) await refreshAllFeeds({ concurrency: 3 })
    })()
    let timer: unknown = null
    const interval = intervalMs(store.settings.refreshInterval)
    const schedule = () => {
      if (interval <= 0) return
      timer = setTimeout(async () => {
        await refreshAllFeeds({ concurrency: 3 })
        schedule()
      }, interval)
    }
    schedule()
    return () => {
      if (timer != null) clearTimeout(timer as number)
    }
  }, [store.settings.refreshInterval])

  // 收藏文章的图片优先缓存，保证离线可读
  useEffect(() => {
    void (async () => {
      const favorites = store.favoriteArticles().slice(0, 20)
      for (const article of favorites) {
        await cacheImages(article.images.map((image) => image.url), 2)
      }
    })()
  }, [store.saved.length])

  const colorScheme = store.settings.appearance === "system" ? undefined : store.settings.appearance

  return (
    <Group preferredColorScheme={colorScheme}>
      <TabView
        selection={selection}
        sheet={
          addFeedOpen
            ? {
                isPresented: true,
                onChanged: (value: boolean) => {
                  if (!value) setAddFeedOpen(false)
                },
                content: <AddFeedPage presented />,
              }
            : undefined
        }
      >
        <Tab title="首页" systemImage="house" value={0}>
          <HomePage onAddFeed={() => setAddFeedOpen(true)} onExit={exitApp} />
        </Tab>
        <Tab title="订阅" systemImage="square.stack" value={1}>
          <SubscriptionsPage onAddFeed={() => setAddFeedOpen(true)} onExit={exitApp} />
        </Tab>
        <Tab title="收藏" systemImage="star" value={2}>
          <FavoritesPage onExit={exitApp} />
        </Tab>
        <Tab title="设置" systemImage="gearshape" value={3}>
          <SettingsPage onExit={exitApp} />
        </Tab>
      </TabView>
    </Group>
  )
}
