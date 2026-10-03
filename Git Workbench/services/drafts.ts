/**
 * 草稿：用户输入的第一落点。
 *
 * 规则（§18 / §44）：
 * 1. 编辑器每次变化都先写本地草稿，网络不参与；
 * 2. 只有用户点「保存」才走 GitHub；
 * 3. 任何网络失败都不能丢内容 —— 草稿留在本地并标记为 failed。
 */

import { Draft, SyncState } from "../types"
import { emitters } from "../utils/emitter"

const DRAFTS_KEY = "gw.drafts"

let cache: Record<string, Draft> | null = null

function keyOf(targetID: string, filename: string): string {
  return `${targetID}::${filename}`
}

function load(): Record<string, Draft> {
  if (!cache) {
    cache = Storage.get<Record<string, Draft>>(DRAFTS_KEY) || {}
  }
  return cache
}

function persist(): void {
  Storage.set(DRAFTS_KEY, cache || {})
}

export function allDrafts(): Draft[] {
  const map = load()
  return Object.keys(map)
    .map(key => map[key])
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getDraft(targetID: string, filename: string): Draft | null {
  return load()[keyOf(targetID, filename)] || null
}

export function draftsFor(targetID: string): Draft[] {
  return allDrafts().filter(draft => draft.targetID === targetID)
}

export function saveDraft(draft: {
  targetID: string
  filename: string
  baseVersion: string
  baseContent: string
  content: string
  state?: SyncState
  error?: string
}): Draft {
  const map = load()
  const key = keyOf(draft.targetID, draft.filename)
  const next: Draft = {
    targetID: draft.targetID,
    filename: draft.filename,
    baseVersion: draft.baseVersion,
    baseContent: draft.baseContent,
    content: draft.content,
    updatedAt: Date.now(),
    state: draft.state || "local",
    error: draft.error || "",
  }
  map[key] = next
  persist()
  emitters.drafts.emit(key)
  return next
}

export function removeDraft(targetID: string, filename: string): void {
  const map = load()
  delete map[keyOf(targetID, filename)]
  persist()
  emitters.drafts.emit(keyOf(targetID, filename))
}

export function clearDrafts(): void {
  cache = {}
  persist()
  emitters.drafts.emit("")
}

/** 未同步（local / failed / conflict）的草稿数量 —— 设置页与 Gist 列表用 */
export function pendingDraftCount(): number {
  return allDrafts().filter(draft => draft.state !== "synced").length
}

export function draftsSummary(): { total: number; pending: number; bytes: number } {
  const drafts = allDrafts()
  return {
    total: drafts.length,
    pending: drafts.filter(draft => draft.state !== "synced").length,
    bytes: drafts.reduce((sum, draft) => sum + draft.content.length, 0),
  }
}
