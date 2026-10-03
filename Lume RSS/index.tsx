/**
 * Lume RSS —— 以阅读体验为核心的现代 RSS 客户端。
 *
 * 启动流程：加载本地数据 → 全屏呈现根视图（左上角 X 退出）→ 释放脚本实例。
 * 用 fullScreen 而不是 sheet：sheet 的下拉手势会和「下拉刷新」冲突。
 */

import { Navigation, Script } from "scripting"
import { ensureProvidersSeeded, store } from "./lib/store"
import { enforceImageCacheLimit } from "./lib/image_cache"
import { RootView } from "./ui/root"

async function run() {
  try {
    await store.load()
    ensureProvidersSeeded()
    void enforceImageCacheLimit(store.settings.imageCacheLimit)
  } catch (error) {
    console.warn("[lume] 初始化失败", String(error))
  }

  await Navigation.present({ element: <RootView />, modalPresentationStyle: "fullScreen" })
  Script.exit()
}

run()
