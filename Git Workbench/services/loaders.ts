/**
 * 数据加载器：缓存优先 + 网络兜底。
 *
 * 每个 load* 都返回 LoadResult，调用方总能拿到「有内容就显示内容，
 * 有错误就显示错误横幅」的结果，不需要各自写缓存逻辑。
 */

import {
  Branch,
  Commit,
  FileContent,
  FileEntry,
  Gist,
  Release,
  RepoTag,
  Repository,
  RepositoryDetail,
} from "../types"
import {
  getFileContent,
  getRepository,
  listBranches,
  listCommits,
  listDirectory,
  listMyRepositories,
  listReleases,
  listStarredRepositories,
  listTags,
} from "../api/repos"
import { getGist, listGists } from "../api/gists"
import { cacheGet, cacheKeys, cacheSet } from "./cache"
import { getSettings } from "./store"

/**
 * 缓存有效期（毫秒）：统一来自设置「缓存有效期」（设置 → 缓存与草稿）。
 *
 * - 0 / 未设置 = 「永不」：返回 Infinity，缓存永远算新鲜，只有手动刷新
 *   或写操作主动失效才会重新请求。
 * - 写操作（保存 Gist、提交仓库文件…）会自己更新/失效相关缓存，
 *   所以有效期设得很长也不会看到自己的旧数据。
 */
export function cacheTTLMs(): number {
  const minutes = getSettings().cacheTTLMinutes
  if (!minutes || minutes <= 0) return Infinity
  return minutes * 60 * 1000
}

export type LoadResult<T> = {
  value: T | null
  ts: number
  fromCache: boolean
  error: unknown | null
}

export function sortEntries(entries: FileEntry[]): FileEntry[] {
  return entries.slice().sort((a, b) => {
    const aDir = a.type === "dir" ? 0 : 1
    const bDir = b.type === "dir" ? 0 : 1
    if (aDir !== bDir) return aDir - bDir
    return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1
  })
}

async function cachedLoad<T>(
  key: string,
  fetcher: () => Promise<T>,
  force: boolean,
  maxAgeMs: number = cacheTTLMs()
): Promise<LoadResult<T>> {
  const cached = cacheGet<T>(key)
  if (cached && !force && maxAgeMs > 0 && Date.now() - cached.ts < maxAgeMs) {
    return { value: cached.value, ts: cached.ts, fromCache: true, error: null }
  }
  try {
    const value = await fetcher()
    cacheSet(key, value)
    return { value, ts: Date.now(), fromCache: false, error: null }
  } catch (e) {
    if (cached) {
      return { value: cached.value, ts: cached.ts, fromCache: true, error: e }
    }
    return { value: null, ts: 0, fromCache: false, error: e }
  }
}

/** 某条数据是否已经过了有效期（有效期取自设置） */
export function isStale(ts: number, maxAgeMs: number = cacheTTLMs()): boolean {
  if (maxAgeMs <= 0) return true
  return Date.now() - ts > maxAgeMs
}

/* ------------------------------------------------------------------ 仓库 */

export function loadMyRepositories(force = false): Promise<LoadResult<Repository[]>> {
  return cachedLoad(cacheKeys.myRepos(), listMyRepositories, force)
}

export function loadStarredRepositories(force = false): Promise<LoadResult<Repository[]>> {
  return cachedLoad(cacheKeys.starredRepos(), listStarredRepositories, force)
}

export function loadRepositoryDetail(
  owner: string,
  name: string,
  force = false
): Promise<LoadResult<RepositoryDetail>> {
  return cachedLoad(
    cacheKeys.repository(`${owner}/${name}`),
    async () => {
      const detail = await getRepository(owner, name)
      return detail
    },
    force
  )
}

export function loadBranches(
  owner: string,
  name: string,
  force = false
): Promise<LoadResult<Branch[]>> {
  return cachedLoad(
    cacheKeys.branches(`${owner}/${name}`),
    () => listBranches(owner, name),
    force
  )
}

export function loadDirectory(
  owner: string,
  name: string,
  ref: string,
  path: string,
  force = false
): Promise<LoadResult<FileEntry[]>> {
  return cachedLoad(
    cacheKeys.tree(`${owner}/${name}`, ref, path),
    async () => sortEntries(await listDirectory(owner, name, path, ref)),
    force
  )
}

export function loadFileContent(
  owner: string,
  name: string,
  ref: string,
  path: string,
  force = false
): Promise<LoadResult<FileContent>> {
  return cachedLoad(
    cacheKeys.file(`${owner}/${name}`, ref, path),
    () => getFileContent(owner, name, path, ref),
    force
  )
}

export function loadCommits(
  owner: string,
  name: string,
  ref: string,
  page = 1
): Promise<LoadResult<Commit[]>> {
  const key = `${cacheKeys.commits(`${owner}/${name}`, ref)}:${page}`
  return cachedLoad(key, () => listCommits(owner, name, ref, undefined, page), false)
}

export function loadTags(owner: string, name: string): Promise<LoadResult<RepoTag[]>> {
  return cachedLoad(`tags:${owner}/${name}`, () => listTags(owner, name), false)
}

export function loadReleases(owner: string, name: string): Promise<LoadResult<Release[]>> {
  return cachedLoad(`releases:${owner}/${name}`, () => listReleases(owner, name), false)
}

/* ------------------------------------------------------------------ Gist */

export function loadGists(force = false): Promise<LoadResult<Gist[]>> {
  return cachedLoad(cacheKeys.myGists(), () => listGists(), force)
}

export function loadGist(id: string, force = false): Promise<LoadResult<Gist>> {
  return cachedLoad(cacheKeys.gist(id), () => getGist(id), force)
}

/** 所有的 load* 都走同一个有效期：设置里的「缓存有效期」（见 cacheTTLMs） */
