/**
 * 仓库 / 内容 / 提交 / 分支 / Tag / Release 相关接口。
 * 只负责「GitHub JSON → 内部模型」的转换，不含任何 UI 逻辑。
 */

import {
  Branch,
  Commit,
  CommitDetail,
  CommitFile,
  FileContent,
  FileEntry,
  Release,
  RepoTag,
  Repository,
  RepositoryDetail,
} from "../types"
import { base64Decode, base64Encode } from "../utils/base64"
import { Account } from "../types"
import { paginate, request } from "./client"

/* ------------------------------------------------------------------ 转换 */

export function toRepository(raw: any): Repository {
  const owner = raw?.owner?.login || ""
  return {
    id: raw?.id || 0,
    name: raw?.name || "",
    fullName: raw?.full_name || (owner ? `${owner}/${raw?.name}` : raw?.name || ""),
    owner,
    description: raw?.description || "",
    defaultBranch: raw?.default_branch || "main",
    updatedAt: raw?.updated_at || raw?.pushed_at || "",
    pushedAt: raw?.pushed_at || raw?.updated_at || "",
    htmlURL: raw?.html_url || "",
    stars: raw?.stargazers_count || 0,
    forks: raw?.forks_count || 0,
    language: raw?.language || null,
    isPrivate: !!raw?.private,
    isFork: !!raw?.fork,
    isArchived: !!raw?.archived,
    createdAt: raw?.created_at || raw?.updated_at || "",
    sizeKB: raw?.size || 0,
  }
}

export function toRepositoryDetail(raw: any): RepositoryDetail {
  const base = toRepository(raw)
  return {
    ...base,
    branches: [],
    openIssues: raw?.open_issues_count || 0,
    ownerAvatar: raw?.owner?.avatar_url || "",
    cloneURL: raw?.clone_url || "",
  }
}

export function toEntry(raw: any): FileEntry {
  const type = raw?.type === "dir" ? "dir" : raw?.type === "submodule" ? "submodule" : raw?.type === "symlink" ? "symlink" : "file"
  return {
    name: raw?.name || "",
    path: raw?.path || raw?.name || "",
    type,
    size: raw?.size || 0,
    sha: raw?.sha || "",
    downloadURL: raw?.download_url || "",
    htmlURL: raw?.html_url || "",
  }
}

function toCommit(raw: any): Commit {
  const sha = raw?.sha || ""
  const author = raw?.author || {}
  const commitAuthor = raw?.commit?.author || {}
  return {
    sha,
    shortSha: sha.slice(0, 7),
    message: raw?.commit?.message || "",
    authorName: commitAuthor.name || author.login || "未知",
    authorLogin: author.login || "",
    authorAvatar: author.avatar_url || "",
    date: commitAuthor.date || raw?.commit?.committer?.date || "",
    htmlURL: raw?.html_url || "",
    parentSha: raw?.parents && raw.parents.length > 0 ? raw.parents[0].sha : "",
  }
}

function toCommitFile(raw: any): CommitFile {
  return {
    filename: raw?.filename || "",
    status: raw?.status || "modified",
    additions: raw?.additions || 0,
    deletions: raw?.deletions || 0,
    patch: raw?.patch || "",
    previousFilename: raw?.previous_filename || "",
  }
}

/* ------------------------------------------------------------------ 账户 */

export async function getViewer(token?: string): Promise<Account> {
  // 传入 token 时用它验证「还没保存的新令牌」，否则用当前账户的令牌
  const raw = await request<any>({ path: "/user", label: "getViewer", token })
  return {
    login: raw?.login || "",
    name: raw?.name || raw?.login || "",
    avatarURL: raw?.avatar_url || "",
    htmlURL: raw?.html_url || "",
    publicRepos: raw?.public_repos || 0,
    scope: "unknown",
    lastVerified: Date.now(),
    addedAt: Date.now(),
  }
}

/* ------------------------------------------------------------------ 仓库 */

/** 我的仓库（按最近推送排序） */
export async function listMyRepositories(): Promise<Repository[]> {
  const raw = await paginate<any>(
    "/user/repos",
    { sort: "pushed", direction: "desc", affiliation: "owner,collaborator,organization_member" },
    100,
    2
  )
  return raw.map(toRepository)
}

/** 我 Star 的仓库 */
export async function listStarredRepositories(): Promise<Repository[]> {
  const raw = await paginate<any>("/user/starred", { sort: "updated", direction: "desc" }, 100, 1)
  return raw.map(toRepository)
}

export async function getRepository(owner: string, repo: string): Promise<RepositoryDetail> {
  const raw = await request<any>({ path: `/repos/${owner}/${repo}`, label: "getRepo" })
  return toRepositoryDetail(raw)
}

export async function isStarred(owner: string, repo: string): Promise<boolean> {
  try {
    await request<void>({ path: `/user/starred/${owner}/${repo}`, label: "isStarred" })
    return true
  } catch (e: any) {
    if (e && e.status === 404) return false
    throw e
  }
}

export async function setStarred(owner: string, repo: string, starred: boolean): Promise<void> {
  const path = `/user/starred/${owner}/${repo}`
  if (starred) {
    await request<void>({ path, method: "PUT", label: "star" })
  } else {
    await request<void>({ path, method: "DELETE", label: "unstar" })
  }
}

/* ------------------------------------------------------------------ 分支 */

export async function listBranches(owner: string, repo: string): Promise<Branch[]> {
  const raw = await paginate<any>(`/repos/${owner}/${repo}/branches`, undefined, 100, 2)
  return raw.map(item => ({
    name: item?.name || "",
    sha: item?.commit?.sha || "",
    isProtected: !!item?.protected,
    isDefault: false,
  }))
}

export async function getBranchSha(owner: string, repo: string, branch: string): Promise<string> {
  const raw = await request<any>({
    path: `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
    label: "getBranch",
  })
  return raw?.commit?.sha || ""
}

export async function createBranch(
  owner: string,
  repo: string,
  name: string,
  fromSha: string
): Promise<void> {
  await request<any>({
    path: `/repos/${owner}/${repo}/git/refs`,
    method: "POST",
    body: { ref: `refs/heads/${name}`, sha: fromSha },
    label: "createBranch",
  })
}

export async function deleteBranch(owner: string, repo: string, name: string): Promise<void> {
  await request<void>({
    path: `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(name)}`,
    method: "DELETE",
    label: "deleteBranch",
  })
}

/* ------------------------------------------------------------------ 目录 / 文件 */

/** 目录列表；path === "" 表示仓库根目录 */
export async function listDirectory(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<FileEntry[]> {
  const raw = await request<any>({
    path: `/repos/${owner}/${repo}/contents/${encodePath(path)}`,
    query: ref ? { ref } : undefined,
    label: "listDir",
  })
  if (!Array.isArray(raw)) {
    // 路径指向单个文件
    return [toEntry(raw)]
  }
  return raw.map(toEntry)
}

export async function getFileMeta(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<FileEntry> {
  const raw = await request<any>({
    path: `/repos/${owner}/${repo}/contents/${encodePath(path)}`,
    query: ref ? { ref } : undefined,
    label: "getFileMeta",
  })
  if (Array.isArray(raw)) throw new Error("这是一个目录，不是文件")
  return toEntry(raw)
}

/** 读取文件文本（一次请求拿内容 + sha；超过 1MB 时需要回落到 raw） */
export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<FileContent> {
  const raw = await request<any>({
    path: `/repos/${owner}/${repo}/contents/${encodePath(path)}`,
    query: ref ? { ref } : undefined,
    label: "getFileContent",
  })
  if (Array.isArray(raw)) throw new Error("这是一个目录，不是文件")
  const entry = toEntry(raw)
  let text = ""
  let oversized = false
  if (raw && typeof raw.content === "string" && raw.content.length > 0) {
    text = base64Decode(raw.content)
  } else {
    oversized = entry.size > 1024 * 1024
  }
  return {
    path: entry.path,
    name: entry.name,
    size: entry.size,
    sha: entry.sha,
    text,
    downloadURL: entry.downloadURL,
    htmlURL: entry.htmlURL,
    oversized,
  }
}

/** 原始内容（大文件 / 无法解码时使用） */
export async function getRawText(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<string> {
  return await request<string>({
    path: `/repos/${owner}/${repo}/contents/${encodePath(path)}`,
    query: ref ? { ref } : undefined,
    accept: "application/vnd.github.raw",
    asText: true,
    timeout: 60,
    label: "getRawText",
  })
}

/** 通过 Contents API 提交单个文件（真实的 Git 提交，不需要本地 clone） */
export async function commitFile(options: {
  owner: string
  repo: string
  path: string
  content: string
  message: string
  sha?: string
  branch?: string
  committer?: { name: string; email: string }
}): Promise<{ sha: string; commitSha: string }> {
  const body: Record<string, any> = {
    message: options.message,
    content: base64Encode(options.content),
  }
  if (options.sha) body.sha = options.sha
  if (options.branch) body.branch = options.branch
  if (options.committer && options.committer.name && options.committer.email) {
    body.committer = { name: options.committer.name, email: options.committer.email }
    body.author = { name: options.committer.name, email: options.committer.email }
  }
  const raw = await request<any>({
    path: `/repos/${options.owner}/${options.repo}/contents/${encodePath(options.path)}`,
    method: "PUT",
    body,
    label: "commitFile",
  })
  return { sha: raw?.content?.sha || "", commitSha: raw?.commit?.sha || "" }
}

export async function deleteFile(options: {
  owner: string
  repo: string
  path: string
  message: string
  sha: string
  branch?: string
}): Promise<void> {
  await request<any>({
    path: `/repos/${options.owner}/${options.repo}/contents/${encodePath(options.path)}`,
    method: "DELETE",
    body: { message: options.message, sha: options.sha, branch: options.branch },
    label: "deleteFile",
  })
}

/* ------------------------------------------------------------------ 提交 */

export async function listCommits(
  owner: string,
  repo: string,
  ref?: string,
  path?: string,
  page = 1,
  perPage = 30
): Promise<Commit[]> {
  const raw = await request<any[]>({
    path: `/repos/${owner}/${repo}/commits`,
    query: { sha: ref, path, per_page: perPage, page },
    label: "listCommits",
  })
  return (raw || []).map(toCommit)
}

export async function getCommit(owner: string, repo: string, sha: string): Promise<CommitDetail> {
  const raw = await request<any>({
    path: `/repos/${owner}/${repo}/commits/${sha}`,
    label: "getCommit",
  })
  const base = toCommit(raw)
  const files: CommitFile[] = Array.isArray(raw?.files) ? raw.files.map(toCommitFile) : []
  return { ...base, files }
}

/* ------------------------------------------------------------------ Tag / Release */

export async function listTags(owner: string, repo: string): Promise<RepoTag[]> {
  const raw = await request<any[]>({
    path: `/repos/${owner}/${repo}/tags`,
    query: { per_page: 100 },
    label: "listTags",
  })
  return (raw || []).map(item => ({ name: item?.name || "", sha: item?.commit?.sha || "" }))
}

export async function listReleases(owner: string, repo: string): Promise<Release[]> {
  const raw = await request<any[]>({
    path: `/repos/${owner}/${repo}/releases`,
    query: { per_page: 50 },
    label: "listReleases",
  })
  return (raw || []).map(item => ({
    id: item?.id || 0,
    name: item?.name || item?.tag_name || "",
    tagName: item?.tag_name || "",
    prerelease: !!item?.prerelease,
    draft: !!item?.draft,
    publishedAt: item?.published_at || item?.created_at || "",
    htmlURL: item?.html_url || "",
    body: item?.body || "",
  }))
}

/* ------------------------------------------------------------------ 工具 */

export function encodePath(path: string): string {
  if (!path) return ""
  return path
    .split("/")
    .map(segment => encodeURIComponent(segment))
    .join("/")
}
