/**
 * Gist API：获取 / 列表 / 创建 / 修改 / 删除。
 * 修改支持：改内容、改文件名、新增文件、删除文件（值为 null）。
 */

import { Gist, GistFile } from "../types"
import { request } from "./client"

export function toGistFile(raw: any): GistFile {
  return {
    filename: raw?.filename || "",
    language: raw?.language || "",
    size: raw?.size || 0,
    rawURL: raw?.raw_url || "",
    truncated: !!raw?.truncated,
    content: typeof raw?.content === "string" ? raw.content : "",
  }
}

export function toGist(raw: any): Gist {
  const files: GistFile[] = []
  const rawFiles = raw?.files
  if (rawFiles && typeof rawFiles === "object") {
    Object.keys(rawFiles).forEach(key => {
      const file = toGistFile(rawFiles[key])
      if (!file.filename) file.filename = key
      files.push(file)
    })
  }
  return {
    id: raw?.id || "",
    description: raw?.description || "",
    isPublic: !!raw?.public,
    ownerLogin: raw?.owner?.login || "",
    ownerAvatar: raw?.owner?.avatar_url || "",
    files,
    createdAt: raw?.created_at || "",
    updatedAt: raw?.updated_at || raw?.created_at || "",
    htmlURL: raw?.html_url || "",
    comments: raw?.comments || 0,
  }
}

export async function listGists(page = 1, perPage = 60): Promise<Gist[]> {
  const raw = await request<any[]>({
    path: "/gists",
    query: { per_page: perPage, page },
    label: "listGists",
  })
  return (raw || []).map(toGist)
}

export async function getGist(id: string): Promise<Gist> {
  const raw = await request<any>({ path: `/gists/${id}`, label: "getGist" })
  return toGist(raw)
}

export type GistFileInput = { filename: string; content: string }

export async function createGist(options: {
  description: string
  isPublic: boolean
  files: GistFileInput[]
}): Promise<Gist> {
  const files: Record<string, { content: string }> = {}
  options.files.forEach(file => {
    files[file.filename] = { content: file.content }
  })
  const raw = await request<any>({
    path: "/gists",
    method: "POST",
    body: { description: options.description, public: options.isPublic, files },
    label: "createGist",
  })
  return toGist(raw)
}

/** 更新 Gist：files 的键是「当前文件名」 */
export async function updateGist(options: {
  id: string
  description?: string
  files?: Record<string, { content?: string; filename?: string } | null>
}): Promise<Gist> {
  const body: Record<string, any> = {}
  if (options.description !== undefined) body.description = options.description
  if (options.files !== undefined) body.files = options.files
  const raw = await request<any>({
    path: `/gists/${options.id}`,
    method: "PATCH",
    body,
    label: "updateGist",
  })
  return toGist(raw)
}

export async function deleteGist(id: string): Promise<void> {
  await request<void>({ path: `/gists/${id}`, method: "DELETE", label: "deleteGist" })
}

/** 通过 raw URL 拉取内容（用于截断的大文件） */
export async function fetchGistFileRaw(rawURL: string): Promise<string> {
  return await request<string>({ path: rawURL, asText: true, timeout: 60, label: "gistRaw" })
}
