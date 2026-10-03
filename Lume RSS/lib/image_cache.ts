/**
 * 图片缓存：三种用途共用一套磁盘缓存。
 *   · 临时缓存（列表里滑过的图片）
 *   · 文章缓存（正文图片，离线可读）
 *   · 收藏缓存（收藏文章的图片优先保留）
 */

import { fetch, useEffect, useState } from "scripting"
import { IMAGES_DIR, ensureStorage, exists, fileSize, listDirectory } from "./persist"
import { hashString } from "./utils"

/**
 * 平台内置的 `<Image imageUrl>` 用的是它自己的加载器，对某些 CDN 的 URL 形态
 * （例如少数派的 `…/x.jpg?imageView2/2/w/1120/q/90/interlace/1/ignore-error/1`，
 * 查询串里带斜杠、末尾没有扩展名）会加载失败——而同样的 URL 我们自己 fetch 能拿到。
 * 所以统一策略：**先用我们自己的网络层下载到本地，再用 filePath 渲染**，
 * imageUrl 只作为下载未完成 / 失败时的兜底。
 */

function extOf(url: string): string {
  const m = /\.(jpe?g|png|gif|webp|avif|heic|bmp)(?:[?#]|$)/i.exec(url)
  return m ? "." + m[1].toLowerCase().replace("jpeg", "jpg") : ".img"
}

export function localImagePath(url: string): string {
  return `${IMAGES_DIR}/${hashString(url)}${extOf(url)}`
}

export async function downloadImage(url: string, timeout = 25000): Promise<Data | null> {
  let timer: unknown = null
  try {
    const response = await Promise.race([
      fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Lume/1.0",
          Accept: "image/*,*/*",
          Referer: url,
        },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeout)
      }),
    ])
    if (!response.ok) return null
    return await response.data()
  } catch {
    return null
  } finally {
    if (timer != null) clearTimeout(timer as number)
  }
}

/** 已缓存则返回本地路径，否则返回 undefined */
export async function cachedImagePath(url: string): Promise<string | undefined> {
  const path = localImagePath(url)
  return exists(path) ? path : undefined
}

/** 下载并缓存，返回本地路径 */
export async function cacheImage(url: string): Promise<string | undefined> {
  const path = localImagePath(url)
  if (exists(path)) return path
  const data = await downloadImage(url)
  if (!data) return undefined
  try {
    await ensureStorage()
    await FileManager.writeAsData(path, data)
    return path
  } catch {
    return undefined
  }
}

/** 批量缓存（文章正文图片、收藏文章图片） */
// ── 并发闸门：避免长列表里同一时间发起太多下载 ──────────────

let active = 0
const waiting: Array<() => void> = []
const MAX_CONCURRENT = 4

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve))
  }
  active++
  try {
    return await task()
  } finally {
    active--
    const next = waiting.shift()
    if (next) next()
  }
}

export function cachedImagePathSync(url: string): string | undefined {
  if (!url) return undefined
  try {
    const path = localImagePath(url)
    return exists(path) ? path : undefined
  } catch {
    return undefined
  }
}

/** 走并发闸门的缓存下载 */
export function cacheImageQueued(url: string): Promise<string | undefined> {
  const cached = cachedImagePathSync(url)
  if (cached) return Promise.resolve(cached)
  return withSlot(() => cacheImage(url))
}

export interface ImageSourceState {
  /** 本地缓存文件；有值时优先用它渲染 */
  filePath?: string
  /** 远程地址（下载未完成或失败时兜底） */
  imageUrl?: string
  loading: boolean
  failed: boolean
}

/**
 * 图片数据源 hook：先看本地缓存，没有再后台下载，完成前用远程地址兜底。
 * `reloadToken` 变化会强制重新下载（图片查看器的「重试」）。
 */
export function useImageSource(url: string, reloadToken = 0): ImageSourceState {
  const [state, setState] = useState<ImageSourceState>(() => {
    const cached = cachedImagePathSync(url)
    return cached
      ? { filePath: cached, loading: false, failed: false }
      : { imageUrl: url, loading: !!url, failed: !url }
  })

  useEffect(() => {
    let cancelled = false
    if (!url) {
      setState({ loading: false, failed: true })
      return
    }
    const cached = cachedImagePathSync(url)
    if (cached) {
      setState({ filePath: cached, loading: false, failed: false })
      return
    }
    setState({ imageUrl: url, loading: true, failed: false })
    void cacheImageQueued(url).then((path) => {
      if (cancelled) return
      if (path) setState({ filePath: path, loading: false, failed: false })
      else setState({ imageUrl: url, loading: false, failed: true })
    })
    return () => {
      cancelled = true
    }
  }, [url, reloadToken])

  return state
}

export async function cacheImages(urls: string[], concurrency = 3): Promise<void> {
  const queue = urls.filter((url) => /^https?:/i.test(url))
  let cursor = 0
  const workers = new Array(Math.min(concurrency, queue.length || 1)).fill(0).map(async () => {
    while (cursor < queue.length) {
      const index = cursor++
      await cacheImage(queue[index])
    }
  })
  await Promise.all(workers)
}

export async function imageCacheStats(): Promise<{ bytes: number; files: number }> {
  const entries = await listDirectory(IMAGES_DIR)
  let bytes = 0
  let files = 0
  for (const entry of entries) {
    bytes += await fileSize(entry)
    files += 1
  }
  return { bytes, files }
}

export async function clearImageCache(): Promise<void> {
  const entries = await listDirectory(IMAGES_DIR)
  for (const entry of entries) {
    try {
      await FileManager.remove(entry)
    } catch {
      // 忽略
    }
  }
}

/** 按设置里的上限清理最旧的图片 */
export async function enforceImageCacheLimit(limitMB: number): Promise<void> {
  if (limitMB <= 0 && limitMB !== 0) return
  const limitBytes = limitMB === -1 ? Infinity : (limitMB === 0 ? 500 : limitMB) * 1024 * 1024
  const entries = await listDirectory(IMAGES_DIR)
  if (!entries.length) return

  const stats: Array<{ path: string; size: number; modified: number }> = []
  for (const entry of entries) {
    try {
      const stat = await FileManager.stat(entry)
      stats.push({ path: entry, size: stat.size ?? 0, modified: stat.modificationDate ?? 0 })
    } catch {
      // 忽略
    }
  }
  let total = stats.reduce((sum, s) => sum + s.size, 0)
  if (total <= limitBytes) return
  stats.sort((a, b) => a.modified - b.modified)
  for (const item of stats) {
    if (total <= limitBytes * 0.9) break
    try {
      await FileManager.remove(item.path)
      total -= item.size
    } catch {
      // 忽略
    }
  }
}
