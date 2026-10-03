/**
 * 缓存：所有网络结果的本地副本，带时间戳。
 * 用于「离线可看已缓存内容」+「减少 GitHub 请求」。
 */

import { CacheEntry } from "../types"
import { getActiveLogin } from "../api/auth"

const PREFIX = "gw.cache."
const INDEX_KEY = "gw.cache.index"
const MAX_ENTRIES = 240
/** 单条缓存超过这个大小就不写（避免 Storage 里塞大字符串） */
const MAX_ENTRY_BYTES = 256 * 1024
/** 全部缓存的总量上限 */
const MAX_TOTAL_BYTES = 6 * 1024 * 1024

type IndexItem = { key: string; ts: number; bytes: number }

let indexCache: IndexItem[] | null = null

function loadIndex(): IndexItem[] {
  if (!indexCache) {
    indexCache = Storage.get<IndexItem[]>(INDEX_KEY) || []
  }
  return indexCache
}

function writeIndex(items: IndexItem[]): void {
  indexCache = items
  Storage.set(INDEX_KEY, items)
}

/**
 * 缓存按账户隔离：同一个仓库名在不同账户下可能完全不同，
 * 切换账户以后旧账户的数据不应该再显示。
 */
function scoped(key: string): string {
  return `${getActiveLogin() || "anon"}::${key}`
}

export function cacheGet<T>(key: string): CacheEntry<T> | null {
  const raw = Storage.get<string>(PREFIX + scoped(key))
  if (!raw) return null
  try {
    return JSON.parse(raw) as CacheEntry<T>
  } catch {
    return null
  }
}

export function cacheSet<T>(key: string, value: T): void {
  let payload = ""
  try {
    payload = JSON.stringify({ value, ts: Date.now() })
  } catch {
    return
  }
  if (payload.length > MAX_ENTRY_BYTES) return
  const storageKey = scoped(key)
  Storage.set(PREFIX + storageKey, payload)
  const items = loadIndex().filter(item => item.key !== storageKey)
  items.push({ key: storageKey, ts: Date.now(), bytes: payload.length })
  writeIndex(prune(items))
}

export function cacheRemove(key: string): void {
  const storageKey = scoped(key)
  Storage.remove(PREFIX + storageKey)
  writeIndex(loadIndex().filter(item => item.key !== storageKey))
}

/**
 * 按前缀清理缓存，返回清掉的条数。
 *
 * 写操作后用来批量失效「某个仓库的所有分支/目录/文件快照」——
 * 缓存有效期可以改成几天，所以写完必须主动失效，不能等它自然过期。
 */
export function cacheRemoveByPrefix(prefix: string): number {
  const storagePrefix = scoped(prefix)
  const items = loadIndex()
  const hit = items.filter(item => item.key.indexOf(storagePrefix) === 0)
  hit.forEach(item => Storage.remove(PREFIX + item.key))
  writeIndex(items.filter(item => item.key.indexOf(storagePrefix) !== 0))
  return hit.length
}

function prune(items: IndexItem[]): IndexItem[] {
  let list = items.slice().sort((a, b) => b.ts - a.ts)
  let total = list.reduce((sum, item) => sum + item.bytes, 0)
  while ((list.length > MAX_ENTRIES || total > MAX_TOTAL_BYTES) && list.length > 0) {
    const dropped = list.pop()
    if (dropped) {
      Storage.remove(PREFIX + dropped.key)
      total -= dropped.bytes
    }
  }
  return list
}

export function cacheStats(): { entries: number; bytes: number; text: string } {
  const items = loadIndex()
  const bytes = items.reduce((sum, item) => sum + item.bytes, 0)
  return { entries: items.length, bytes, text: humanBytes(bytes) }
}

/** 只统计当前账户的缓存 */
export function cacheStatsForActiveAccount(): { entries: number; bytes: number; text: string } {
  const prefix = `${getActiveLogin() || "anon"}::`
  const items = loadIndex().filter(item => item.key.indexOf(prefix) === 0)
  const bytes = items.reduce((sum, item) => sum + item.bytes, 0)
  return { entries: items.length, bytes, text: humanBytes(bytes) }
}

export function cacheClear(): { entries: number; bytes: number } {
  const items = loadIndex()
  const bytes = items.reduce((sum, item) => sum + item.bytes, 0)
  items.forEach(item => Storage.remove(PREFIX + item.key))
  // 兜底：清理索引里没记录但前缀匹配的残留
  Storage.keys()
    .filter(key => key.indexOf(PREFIX) === 0)
    .forEach(key => Storage.remove(key))
  writeIndex([])
  return { entries: items.length, bytes }
}

/** 只清理某个账户的缓存（移除账户时调用） */
export function cacheClearAccount(login: string): { entries: number; bytes: number } {
  const prefix = `${login}::`
  const all = loadIndex()
  const items = all.filter(item => item.key.indexOf(prefix) === 0)
  const bytes = items.reduce((sum, item) => sum + item.bytes, 0)
  items.forEach(item => Storage.remove(PREFIX + item.key))
  writeIndex(all.filter(item => item.key.indexOf(prefix) !== 0))
  return { entries: items.length, bytes }
}

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/* --------------------------------------------------------------- 缓存键 */

export const cacheKeys = {
  myRepos: () => "repos:mine",
  starredRepos: () => "repos:starred",
  repository: (fullName: string) => `repo:${fullName}`,
  tree: (fullName: string, ref: string, path: string) => `tree:${fullName}@${ref}:${path || "/"}`,
  file: (fullName: string, ref: string, path: string) => `file:${fullName}@${ref}:${path}`,
  myGists: () => "gists:mine",
  gist: (id: string) => `gist:${id}`,
  commits: (fullName: string, ref: string) => `commits:${fullName}@${ref}`,
  branches: (fullName: string) => `branches:${fullName}`,
}
