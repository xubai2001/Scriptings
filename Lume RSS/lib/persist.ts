/**
 * 本地优先持久化层。
 *
 * 数据全部保存在 App Group 目录下的 lume/ 里（不经过任何服务器）：
 *   lume/settings.json          设置
 *   lume/providers.json         AI Provider（apiKey 单独放 Keychain）
 *   lume/feeds.json             订阅源
 *   lume/folders.json           文件夹
 *   lume/articles/<feedId>.json 每个 feed 的文章（含正文块）
 *   lume/saved.json             收藏 / 稍后阅读的独立快照
 *   lume/images/                图片缓存
 */

/**
 * 开发／预览脚本必须先 import "./isolate"，把数据目录隔离到 lume-dev 并禁用写入，
 * 否则预览数据会写进用户的真实资料（曾经因此给用户塞进一个假订阅）。
 */
const devOverride = (globalThis as { __LUME_DATA_DIR__?: string }).__LUME_DATA_DIR__

/** 每次调用读一次，方便测试脚本在启动后再打开写入 */
function isReadOnly(): boolean {
  return !!(globalThis as { __LUME_NO_WRITE__?: boolean }).__LUME_NO_WRITE__
}

export const LUME_DIR = devOverride ?? FileManager.appGroupDocumentsDirectory + "/lume"
export const ARTICLES_DIR = LUME_DIR + "/articles"
export const IMAGES_DIR = LUME_DIR + "/images"

let dirsReady: Promise<void> | null = null

export function ensureStorage(): Promise<void> {
  if (!dirsReady) {
    dirsReady = (async () => {
      for (const dir of [LUME_DIR, ARTICLES_DIR, IMAGES_DIR]) {
        if (!FileManager.existsSync(dir)) {
          try {
            await FileManager.createDirectory(dir, true)
          } catch {
            // 目录已存在或创建失败：后续写入会再次报错
          }
        }
      }
    })()
  }
  return dirsReady
}

export async function readJSON<T>(path: string, fallback: T): Promise<T> {
  try {
    if (!FileManager.existsSync(path)) return fallback
    const text = await FileManager.readAsString(path)
    if (!text || !text.trim()) return fallback
    return JSON.parse(text) as T
  } catch (error) {
    console.warn("[lume] 读取失败", path, String(error))
    return fallback
  }
}

export async function writeJSON(path: string, value: unknown): Promise<void> {
  if (isReadOnly()) return
  await ensureStorage()
  try {
    await FileManager.writeAsString(path, JSON.stringify(value))
  } catch (error) {
    console.warn("[lume] 写入失败", path, String(error))
  }
}

export async function deletePath(path: string): Promise<void> {
  try {
    if (FileManager.existsSync(path)) await FileManager.remove(path)
  } catch (error) {
    console.warn("[lume] 删除失败", path, String(error))
  }
}

export function exists(path: string): boolean {
  try {
    return FileManager.existsSync(path)
  } catch {
    return false
  }
}

export async function listDirectory(path: string): Promise<string[]> {
  try {
    if (!FileManager.existsSync(path)) return []
    return await FileManager.readDirectory(path)
  } catch {
    return []
  }
}

export async function fileSize(path: string): Promise<number> {
  try {
    const stat = await FileManager.stat(path)
    return stat.size ?? 0
  } catch {
    return 0
  }
}

export async function directorySize(path: string): Promise<{ bytes: number; files: number }> {
  const entries = await listDirectory(path)
  let bytes = 0
  let files = 0
  for (const entry of entries) {
    try {
      if (FileManager.isDirectorySync(entry)) {
        const nested = await directorySize(entry)
        bytes += nested.bytes
        files += nested.files
      } else {
        bytes += await fileSize(entry)
        files += 1
      }
    } catch {
      // 忽略单个条目错误
    }
  }
  return { bytes, files }
}

// ── API Key：本地 Keychain，永不上传 ─────────────────────────

export function saveAPIKey(providerID: string, apiKey: string): void {
  try {
    if (!apiKey) {
      Keychain.remove(apiKeyName(providerID))
      return
    }
    Keychain.set(apiKeyName(providerID), apiKey)
  } catch (error) {
    console.warn("[lume] 保存 API Key 失败", String(error))
  }
}

export function loadAPIKey(providerID: string): string {
  try {
    return Keychain.get(apiKeyName(providerID)) ?? ""
  } catch {
    return ""
  }
}

function apiKeyName(providerID: string): string {
  return `lume.apikey.${providerID}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
