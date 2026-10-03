/**
 * 应用级状态：设置、收藏、最近访问。
 *
 * 这些数据都存在 Storage（脚本私有域），不涉及敏感信息；
 * 令牌只走 Keychain（见 api/auth.ts）。
 */

import { Favorites, RecentItem, Settings } from "../types"
import { emitters } from "../utils/emitter"

const SETTINGS_KEY = "gw.settings"
const FAVORITES_KEY = "gw.favorites"
const RECENT_KEY = "gw.recent"

const MAX_RECENT = 40

export function defaultSettings(): Settings {
  return {
    editorTextSize: "large",
    tabWidth: 4,
    autoIndent: true,
    autoSaveDraft: true,
    appearance: "system",
    requestTimeout: 25,
    /** 默认 5 分钟：和之前写死的 STALE_MS 一致 */
    cacheTTLMinutes: 5,
    committerName: "",
    committerEmail: "",
    largeFileThreshold: 512 * 1024,
    maxPreviewBytes: 2 * 1024 * 1024,
    repoSort: "updated",
    repoFilter: {
      visibility: "all",
      kind: "all",
      language: null,
      favoritesOnly: false,
    },
    gistSort: "updated",
    gistFilter: {
      visibility: "all",
      favoritesOnly: false,
      draftsOnly: false,
    },
    showRecentRepositories: true,
  }
}

let cachedSettings: Settings | null = null

export function getSettings(): Settings {
  if (!cachedSettings) {
    const stored = Storage.get<Partial<Settings>>(SETTINGS_KEY)
    cachedSettings = { ...defaultSettings(), ...(stored || {}) }
  }
  return cachedSettings
}

export function updateSettings(patch: Partial<Settings>): void {
  const next = { ...getSettings(), ...patch }
  cachedSettings = next
  Storage.set(SETTINGS_KEY, next)
  emitters.settings.emit()
}

export function resetSettings(): void {
  cachedSettings = defaultSettings()
  Storage.set(SETTINGS_KEY, cachedSettings)
  emitters.settings.emit()
}

/* --------------------------------------------------------------- 收藏 */

let cachedFavorites: Favorites | null = null

export function getFavorites(): Favorites {
  if (!cachedFavorites) {
    const stored = Storage.get<Favorites>(FAVORITES_KEY)
    cachedFavorites = { repos: stored?.repos || [], gists: stored?.gists || [] }
  }
  return cachedFavorites
}

function persistFavorites(): void {
  Storage.set(FAVORITES_KEY, cachedFavorites)
  emitters.favorites.emit()
}

export function isFavoriteRepo(fullName: string): boolean {
  return getFavorites().repos.indexOf(fullName) !== -1
}

export function isFavoriteGist(id: string): boolean {
  return getFavorites().gists.indexOf(id) !== -1
}

export function toggleFavoriteRepo(fullName: string): boolean {
  const favorites = getFavorites()
  const idx = favorites.repos.indexOf(fullName)
  if (idx === -1) favorites.repos.push(fullName)
  else favorites.repos.splice(idx, 1)
  persistFavorites()
  return idx === -1
}

export function toggleFavoriteGist(id: string): boolean {
  const favorites = getFavorites()
  const idx = favorites.gists.indexOf(id)
  if (idx === -1) favorites.gists.push(id)
  else favorites.gists.splice(idx, 1)
  persistFavorites()
  return idx === -1
}

/* --------------------------------------------------------------- 最近访问 */

/** 最近访问 */
export const RECENT_SEARCH_KEY = "gw.searches"

export function getRecentSearches(): string[] {
  return Storage.get<string[]>(RECENT_SEARCH_KEY) || []
}

export function pushRecentSearch(keyword: string): void {
  const value = (keyword || "").trim()
  if (!value) return
  const list = getRecentSearches().filter(item => item !== value)
  list.unshift(value)
  Storage.set(RECENT_SEARCH_KEY, list.slice(0, 8))
}

export function clearRecentSearches(): void {
  Storage.set(RECENT_SEARCH_KEY, [])
}

let cachedRecent: RecentItem[] | null = null

export function getRecent(): RecentItem[] {
  if (!cachedRecent) {
    cachedRecent = Storage.get<RecentItem[]>(RECENT_KEY) || []
  }
  return cachedRecent
}

export function pushRecent(item: Omit<RecentItem, "ts" | "key">): void {
  const list = getRecent().slice()
  const key = `${item.targetID}:${item.filename}`
  const next: RecentItem = { ...item, key, ts: Date.now() }
  const filtered = list.filter(entry => entry.key !== key)
  filtered.unshift(next)
  cachedRecent = filtered.slice(0, MAX_RECENT)
  Storage.set(RECENT_KEY, cachedRecent)
  emitters.recent.emit()
}

export function clearRecent(): void {
  cachedRecent = []
  Storage.set(RECENT_KEY, [])
  emitters.recent.emit()
}

/** 最近访问按日期分组显示用 */
export function recentForTarget(targetID: string): RecentItem[] {
  return getRecent().filter(item => item.targetID === targetID)
}

/* --------------------------------------------------------------- 离线状态 */

export const netState: { online: boolean; lastFailure: number; lastSuccess: number } = {
  online: true,
  lastFailure: 0,
  lastSuccess: 0,
}
