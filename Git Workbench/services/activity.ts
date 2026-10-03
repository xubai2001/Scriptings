/** 活动中心：记录最近执行过的 Git / Gist 操作 */

import { ActivityItem, ActivityKind } from "../types"
import { emitters } from "../utils/emitter"
import { getActiveLogin } from "../api/auth"

const ACTIVITY_KEY = "gw.activity"
const MAX_ITEMS = 300

let cache: ActivityItem[] | null = null

export function listActivity(): ActivityItem[] {
  if (!cache) {
    cache = Storage.get<ActivityItem[]>(ACTIVITY_KEY) || []
  }
  return cache
}

export function recordActivity(input: {
  kind: ActivityKind
  title: string
  subtitle?: string
  ok: boolean
  detail?: string
  error?: string
  httpStatus?: number
  repo?: string
  branch?: string
  files?: string[]
  /** 不传时自动记录当前账户 */
  account?: string
}): ActivityItem {
  const item: ActivityItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    kind: input.kind,
    title: input.title,
    subtitle: input.subtitle || "",
    ok: input.ok,
    detail: input.detail || "",
    error: input.error || "",
    httpStatus: input.httpStatus || 0,
    repo: input.repo || "",
    branch: input.branch || "",
    account: input.account || getActiveLogin() || "",
    files: input.files || [],
  }
  const next = [item, ...listActivity()].slice(0, MAX_ITEMS)
  cache = next
  Storage.set(ACTIVITY_KEY, next)
  emitters.activity.emit()
  return item
}

export function clearActivity(): void {
  cache = []
  Storage.set(ACTIVITY_KEY, [])
  emitters.activity.emit()
}

export function getActivityItem(id: string): ActivityItem | null {
  return listActivity().find(item => item.id === id) || null
}

export function activityKindLabel(kind: ActivityKind): string {
  switch (kind) {
    case "gist_sync":
      return "Gist 同步"
    case "gist_create":
      return "创建 Gist"
    case "gist_delete":
      return "删除 Gist"
    case "gist_file_add":
      return "添加 Gist 文件"
    case "gist_file_delete":
      return "删除 Gist 文件"
    case "repo_commit":
      return "Commit"
    case "repo_branch_create":
      return "创建分支"
    case "repo_branch_delete":
      return "删除分支"
    case "repo_refresh":
      return "刷新仓库"
    case "auth":
      return "账户"
    default:
      return "操作"
  }
}

export function activityIcon(item: ActivityItem): string {
  if (!item.ok) return "exclamationmark.triangle.fill"
  switch (item.kind) {
    case "gist_sync":
      return "checkmark.circle.fill"
    case "gist_create":
      return "plus.circle.fill"
    case "gist_delete":
      return "trash.fill"
    case "gist_file_add":
      return "doc.badge.plus"
    case "gist_file_delete":
      return "doc.badge.minus"
    case "repo_commit":
      return "checkmark.circle.fill"
    case "repo_branch_create":
      return "arrow.triangle.branch"
    case "repo_branch_delete":
      return "scissors"
    case "repo_refresh":
      return "arrow.clockwise"
    case "auth":
      return "person.crop.circle"
    default:
      return "circle"
  }
}
