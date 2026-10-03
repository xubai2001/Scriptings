/**
 * 同步：Gist 与仓库文件的写操作都经过这里。
 *
 * 关键约束（§18 / §19 / §51.7）：
 * - 绝不静默覆盖远程内容：写之前先比对远程版本；
 * - 网络失败不丢内容：草稿已在本地，这里只回报失败；
 * - 所有同步都是异步的，不阻塞编辑器输入。
 */

import { Gist } from "../types"
import { GitHubError, ErrorInfo, toErrorInfo } from "../utils/errors"
import { createGist, deleteGist, getGist, updateGist } from "../api/gists"
import { commitFile, getFileContent } from "../api/repos"
import { recordActivity } from "./activity"
import { cacheKeys, cacheRemove, cacheRemoveByPrefix, cacheSet } from "./cache"
import { getSettings } from "./store"

export type SyncOutcome =
  | { status: "synced"; gist: Gist | null; sha: string }
  | { status: "conflict"; remoteContent: string; remoteVersion: string; remoteUpdatedAt: string }
  | { status: "failed"; info: ErrorInfo; raw: string }

export function cacheGist(gist: Gist): void {
  cacheSet(cacheKeys.gist(gist.id), gist)
}

/**
 * 写操作后主动失效受影响的缓存。
 *
 * 缓存有效期可以设成几天，所以「等它自然过期」不可接受：
 * 刚改完的内容/列表必须马上能读到新的。
 */
function invalidateGistList(): void {
  cacheRemove(cacheKeys.myGists())
}

/** 提交后这个仓库的文件内容 / 目录 / 提交历史快照都过期了，按前缀一次性清掉 */
function invalidateRepository(fullName: string): void {
  cacheRemove(cacheKeys.repository(fullName))
  cacheRemoveByPrefix(`tree:${fullName}@`)
  cacheRemoveByPrefix(`file:${fullName}@`)
  cacheRemoveByPrefix(`commits:${fullName}@`)
}

/* ------------------------------------------------------------------ Gist */

export function gistFileContent(gist: Gist, filename: string): string {
  const file = gist.files.find(item => item.filename === filename)
  return file ? file.content : ""
}

/**
 * 保存 Gist 文件。
 * - resolution = "check"（默认）：先拉远程，版本变化且内容不同 → 冲突
 * - resolution = "keep-local"：用户已经看过差异并选择保留本地，直接覆盖
 */
export async function saveGistFile(options: {
  gist: Gist
  filename: string
  content: string
  baseVersion: string
  resolution?: "check" | "keep-local"
  isNewFile?: boolean
}): Promise<SyncOutcome> {
  const { gist, filename, content } = options
  const resolution = options.resolution || "check"

  try {
    let remote: Gist | null = null
    if (resolution === "check") {
      remote = await getGist(gist.id)
      const remoteVersion = remote.updatedAt || ""
      const remoteContent = options.isNewFile ? "" : gistFileContent(remote, filename)
      const versionChanged = remoteVersion !== options.baseVersion
      const contentChanged = remoteContent !== content
      const remoteFileMissing = !options.isNewFile && !remote.files.some(f => f.filename === filename)
      if ((versionChanged || remoteFileMissing) && contentChanged) {
        return {
          status: "conflict",
          remoteContent: remoteFileMissing ? "" : remoteContent,
          remoteVersion,
          remoteUpdatedAt: remote.updatedAt || "",
        }
      }
    }

    const files: Record<string, { content: string }> = {}
    files[filename] = { content }
    const updated = await updateGist({ id: gist.id, files })
    cacheGist(updated)
    invalidateGistList()
    recordActivity({
      kind: "gist_sync",
      title: "Gist 已同步",
      subtitle: filename,
      ok: true,
      files: [filename],
      detail: `Gist ${gist.id}`,
    })
    return { status: "synced", gist: updated, sha: "" }
  } catch (e) {
    const info = toErrorInfo(e, "同步失败")
    recordActivity({
      kind: "gist_sync",
      title: info.title,
      subtitle: filename,
      ok: false,
      error: info.detail,
      httpStatus: info.httpStatus,
      files: [filename],
      detail: `Gist ${gist.id}`,
    })
    return { status: "failed", info, raw: info.detail }
  }
}

export async function createGistFile(options: {
  gist: Gist
  filename: string
  content: string
}): Promise<SyncOutcome> {
  try {
    const files: Record<string, { content: string }> = {}
    files[options.filename] = { content: options.content }
    const updated = await updateGist({ id: options.gist.id, files })
    cacheGist(updated)
    invalidateGistList()
    recordActivity({
      kind: "gist_file_add",
      title: "已添加文件",
      subtitle: options.filename,
      ok: true,
      files: [options.filename],
      detail: `Gist ${options.gist.id}`,
    })
    return { status: "synced", gist: updated, sha: "" }
  } catch (e) {
    const info = toErrorInfo(e, "添加文件失败")
    recordActivity({
      kind: "gist_file_add",
      title: info.title,
      subtitle: options.filename,
      ok: false,
      error: info.detail,
      httpStatus: info.httpStatus,
      files: [options.filename],
    })
    return { status: "failed", info, raw: info.detail }
  }
}

export async function renameGistFile(options: {
  gist: Gist
  oldName: string
  newName: string
}): Promise<SyncOutcome> {
  try {
    const files: Record<string, { filename: string }> = {}
    files[options.oldName] = { filename: options.newName }
    const updated = await updateGist({ id: options.gist.id, files })
    cacheGist(updated)
    invalidateGistList()
    recordActivity({
      kind: "gist_sync",
      title: "已重命名文件",
      subtitle: `${options.oldName} → ${options.newName}`,
      ok: true,
      files: [options.newName],
      detail: `Gist ${options.gist.id}`,
    })
    return { status: "synced", gist: updated, sha: "" }
  } catch (e) {
    const info = toErrorInfo(e, "重命名失败")
    recordActivity({
      kind: "gist_sync",
      title: info.title,
      subtitle: `${options.oldName} → ${options.newName}`,
      ok: false,
      error: info.detail,
      httpStatus: info.httpStatus,
    })
    return { status: "failed", info, raw: info.detail }
  }
}

/** 删除 Gist 中的文件；只剩一个文件时 GitHub 会直接删除整个 Gist */
export async function deleteGistFile(options: {
  gist: Gist
  filename: string
}): Promise<SyncOutcome> {
  try {
    const files: Record<string, null> = {}
    files[options.filename] = null
    const updated = await updateGist({ id: options.gist.id, files })
    cacheGist(updated)
    invalidateGistList()
    recordActivity({
      kind: "gist_file_delete",
      title: "已删除文件",
      subtitle: options.filename,
      ok: true,
      files: [options.filename],
      detail: `Gist ${options.gist.id}`,
    })
    return { status: "synced", gist: updated, sha: "" }
  } catch (e) {
    const info = toErrorInfo(e, "删除文件失败")
    recordActivity({
      kind: "gist_file_delete",
      title: info.title,
      subtitle: options.filename,
      ok: false,
      error: info.detail,
      httpStatus: info.httpStatus,
    })
    return { status: "failed", info, raw: info.detail }
  }
}

export async function createNewGist(options: {
  description: string
  isPublic: boolean
  files: { filename: string; content: string }[]
}): Promise<{ ok: true; gist: Gist } | { ok: false; info: ErrorInfo }> {
  try {
    const gist = await createGist(options)
    cacheGist(gist)
    invalidateGistList()
    recordActivity({
      kind: "gist_create",
      title: "创建 Gist",
      subtitle: options.files.map(f => f.filename).join(", "),
      ok: true,
      files: options.files.map(f => f.filename),
      detail: options.description,
    })
    return { ok: true, gist }
  } catch (e) {
    const info = toErrorInfo(e, "创建失败")
    recordActivity({
      kind: "gist_create",
      title: info.title,
      subtitle: options.files.map(f => f.filename).join(", "),
      ok: false,
      error: info.detail,
      httpStatus: info.httpStatus,
    })
    return { ok: false, info }
  }
}

export async function removeGist(id: string, label: string): Promise<{ ok: boolean; info?: ErrorInfo }> {
  try {
    await deleteGist(id)
    cacheRemove(cacheKeys.gist(id))
    invalidateGistList()
    recordActivity({ kind: "gist_delete", title: "删除 Gist", subtitle: label, ok: true, detail: id })
    return { ok: true }
  } catch (e) {
    const info = toErrorInfo(e, "删除失败")
    recordActivity({
      kind: "gist_delete",
      title: info.title,
      subtitle: label,
      ok: false,
      error: info.detail,
      httpStatus: info.httpStatus,
      detail: id,
    })
    return { ok: false, info }
  }
}

/* ------------------------------------------------------------------ 仓库文件 */

/** 提交仓库里的单个文件（Contents API，真实 Git 提交） */
export async function saveRepositoryFile(options: {
  owner: string
  repo: string
  path: string
  content: string
  message: string
  sha: string
  branch?: string
}): Promise<SyncOutcome> {
  const settings = getSettings()
  try {
    const result = await commitFile({
      owner: options.owner,
      repo: options.repo,
      path: options.path,
      content: options.content,
      message: options.message,
      sha: options.sha || undefined,
      branch: options.branch,
      committer:
        settings.committerName && settings.committerEmail
          ? { name: settings.committerName, email: settings.committerEmail }
          : undefined,
    })
    recordActivity({
      kind: "repo_commit",
      title: "Commit",
      subtitle: options.message.split("\n")[0] || options.path,
      ok: true,
      repo: `${options.owner}/${options.repo}`,
      branch: options.branch || "",
      files: [options.path],
      detail: result.commitSha ? result.commitSha.slice(0, 7) : "",
    })
    // 这次提交改动了文件、目录列表与提交历史，立刻失效这个仓库的快照
    invalidateRepository(`${options.owner}/${options.repo}`)
    return { status: "synced", gist: null, sha: result.sha }
  } catch (e) {
    const status = e instanceof GitHubError ? e.status : 0
    if (status === 409 || status === 422) {
      // 远程文件已经变化：把远程内容取回来交给 UI 做对比
      try {
        const remote = await getFileContent(options.owner, options.repo, options.path, options.branch)
        recordActivity({
          kind: "repo_commit",
          title: "远程内容已变化",
          subtitle: options.path,
          ok: false,
          error: "HTTP 409/422 — 文件 sha 不一致",
          httpStatus: status,
          repo: `${options.owner}/${options.repo}`,
          branch: options.branch || "",
          files: [options.path],
        })
        return {
          status: "conflict",
          remoteContent: remote.text,
          remoteVersion: remote.sha,
          remoteUpdatedAt: "",
        }
      } catch {
        // 拉取远程失败则按普通失败处理
      }
    }
    const info = toErrorInfo(e, "提交失败")
    recordActivity({
      kind: "repo_commit",
      title: info.title,
      subtitle: options.path,
      ok: false,
      error: info.detail,
      httpStatus: info.httpStatus,
      repo: `${options.owner}/${options.repo}`,
      branch: options.branch || "",
      files: [options.path],
    })
    return { status: "failed", info, raw: info.detail }
  }
}
