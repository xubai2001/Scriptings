/**
 * 列表的筛选与排序（纯函数，不碰网络与界面）
 *
 * 排序与筛选只作用于「我的仓库 / Starred / 我的 Gist」这些列表；
 * 收藏与最近访问是快捷入口，保持用户自己的顺序。
 */

import {
  Gist,
  GistFilter,
  GistSort,
  RepoFilter,
  RepoKindFilter,
  RepoSort,
  Repository,
  VisibilityFilter,
} from "../types"

/* --------------------------------------------------------------- 排序 */

export const REPO_SORT_OPTIONS: { value: RepoSort; label: string; detail: string }[] = [
  { value: "updated", label: "最近更新", detail: "按仓库最后更新时间" },
  { value: "pushed", label: "最近推送", detail: "按最后一次 push 时间" },
  { value: "created", label: "最近创建", detail: "按仓库创建时间" },
  { value: "name", label: "名称", detail: "按字母顺序" },
  { value: "stars", label: "Stars", detail: "Star 最多的在前" },
]

export const GIST_SORT_OPTIONS: { value: GistSort; label: string; detail: string }[] = [
  { value: "updated", label: "最近更新", detail: "按 Gist 最后修改时间" },
  { value: "created", label: "最近创建", detail: "按创建时间" },
  { value: "name", label: "文件名", detail: "按第一个文件的名字" },
  { value: "files", label: "文件数", detail: "文件多的在前" },
]

function time(value: string): number {
  const ts = Date.parse(value || "")
  return isNaN(ts) ? 0 : ts
}

export function repoSortLabel(sort: RepoSort): string {
  const found = REPO_SORT_OPTIONS.find(option => option.value === sort)
  return found ? found.label : "最近更新"
}

export function gistSortLabel(sort: GistSort): string {
  const found = GIST_SORT_OPTIONS.find(option => option.value === sort)
  return found ? found.label : "最近更新"
}

export function sortRepositories(list: Repository[], sort: RepoSort): Repository[] {
  const next = list.slice()
  switch (sort) {
    case "name":
      next.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
      break
    case "stars":
      next.sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name))
      break
    case "created":
      next.sort((a, b) => time(b.createdAt) - time(a.createdAt))
      break
    case "pushed":
      next.sort((a, b) => time(b.pushedAt) - time(a.pushedAt))
      break
    default:
      next.sort((a, b) => time(b.updatedAt) - time(a.updatedAt))
      break
  }
  return next
}

export function sortGists(list: Gist[], sort: GistSort): Gist[] {
  const next = list.slice()
  switch (sort) {
    case "name":
      next.sort((a, b) => gistName(a).toLowerCase().localeCompare(gistName(b).toLowerCase()))
      break
    case "files":
      next.sort((a, b) => b.files.length - a.files.length || gistName(a).localeCompare(gistName(b)))
      break
    case "created":
      next.sort((a, b) => time(b.createdAt) - time(a.createdAt))
      break
    default:
      next.sort((a, b) => time(b.updatedAt) - time(a.updatedAt))
      break
  }
  return next
}

function gistName(gist: Gist): string {
  const first = gist.files[0]
  return first ? first.filename : gist.description || gist.id
}

/* --------------------------------------------------------------- 筛选 */

export const REPO_KIND_OPTIONS: { value: RepoKindFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "source", label: "非 Fork" },
  { value: "fork", label: "仅 Fork" },
  { value: "archived", label: "已归档" },
]

export const VISIBILITY_OPTIONS: { value: VisibilityFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "public", label: "公开" },
  { value: "private", label: "私有" },
]

export function filterRepositories(
  list: Repository[],
  filter: RepoFilter,
  isFavorite: (fullName: string) => boolean
): Repository[] {
  return list.filter(repo => {
    if (filter.visibility === "public" && repo.isPrivate) return false
    if (filter.visibility === "private" && !repo.isPrivate) return false
    if (filter.kind === "source" && repo.isFork) return false
    if (filter.kind === "fork" && !repo.isFork) return false
    if (filter.kind === "archived" && !repo.isArchived) return false
    if (filter.language && (repo.language || "") !== filter.language) return false
    if (filter.favoritesOnly && !isFavorite(repo.fullName)) return false
    return true
  })
}

export function filterGists(
  list: Gist[],
  filter: GistFilter,
  isFavorite: (id: string) => boolean,
  draftIDs: string[]
): Gist[] {
  const draftSet: Record<string, boolean> = {}
  draftIDs.forEach(id => {
    draftSet[id] = true
  })
  return list.filter(gist => {
    if (filter.visibility === "public" && !gist.isPublic) return false
    if (filter.visibility === "private" && gist.isPublic) return false
    if (filter.favoritesOnly && !isFavorite(gist.id)) return false
    if (filter.draftsOnly && !draftSet[gist.id]) return false
    return true
  })
}

/** 从已加载的仓库里收集语言，用于语言筛选菜单 */
export function repoLanguages(list: Repository[]): string[] {
  const seen: Record<string, boolean> = {}
  const result: string[] = []
  list.forEach(repo => {
    const language = repo.language
    if (language && !seen[language]) {
      seen[language] = true
      result.push(language)
    }
  })
  return result.sort((a, b) => a.localeCompare(b))
}

/* --------------------------------------------------------------- 摘要 */

export function isRepoFilterActive(filter: RepoFilter): boolean {
  return (
    filter.visibility !== "all" ||
    filter.kind !== "all" ||
    filter.language !== null ||
    filter.favoritesOnly
  )
}

export function isGistFilterActive(filter: GistFilter): boolean {
  return filter.visibility !== "all" || filter.favoritesOnly || filter.draftsOnly
}

/** 顶部摘要，让用户一眼看到当前生效的条件 */
export function repoFilterSummary(filter: RepoFilter, sort: RepoSort): string {
  const parts: string[] = []
  if (filter.visibility === "private") parts.push("私有")
  if (filter.visibility === "public") parts.push("公开")
  if (filter.kind === "source") parts.push("非 Fork")
  if (filter.kind === "fork") parts.push("仅 Fork")
  if (filter.kind === "archived") parts.push("已归档")
  if (filter.language) parts.push(filter.language)
  if (filter.favoritesOnly) parts.push("仅收藏")
  parts.push(`按${repoSortLabel(sort)}`)
  return parts.join(" · ")
}

export function gistFilterSummary(filter: GistFilter, sort: GistSort): string {
  const parts: string[] = []
  if (filter.visibility === "public") parts.push("Public")
  if (filter.visibility === "private") parts.push("Secret")
  if (filter.favoritesOnly) parts.push("仅收藏")
  if (filter.draftsOnly) parts.push("仅有未同步修改")
  parts.push(`按${gistSortLabel(sort)}`)
  return parts.join(" · ")
}
