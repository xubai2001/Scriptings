/** Gist 详情（§16 / §20）：文件列表 + 文件级操作 */

import {
  Button,
  Group,
  HStack,
  Image,
  List,
  Menu,
  Navigation,
  NavigationLink,
  Section,
  Spacer,
  Text,
  VStack,
  useEffect,
  useState,
} from "scripting"
import { Gist } from "../types"
import { updateGist } from "../api/gists"
import { loadGist } from "../services/loaders"
import { getDraft } from "../services/drafts"
import {
  createGistFile,
  deleteGistFile,
  removeGist,
  renameGistFile,
} from "../services/sync"
import { emitters } from "../utils/emitter"
import { useWatch } from "../utils/hooks"
import { ErrorInfo, toErrorInfo, validationError } from "../utils/errors"
import { fileIcon, fileTint } from "../utils/filetype"
import { baseName, fileSize, relativeTime } from "../utils/format"
import { ErrorBanner, Hint } from "./components"
import { GistFileDraftView } from "./CreateGistView"
import { GistEditorView } from "./GistEditorView"
import type { GistFileDraft } from "./CreateGistView"

type Loaded<T> = { value: T | null; ts: number; fromCache: boolean; error: unknown | null }

export function GistDetailView({ gistId }: { gistId: string }) {
  const dismiss = Navigation.useDismiss()
  const [gist, setGist] = useState<Loaded<Gist> | null>(null)
  const [error, setError] = useState<ErrorInfo | null>(null)
  useWatch(emitters.drafts)

  async function load(force: boolean) {
    const result = await loadGist(gistId, force)
    setGist(result)
    if (result.error && !result.value) setError(toErrorInfo(result.error, "加载 Gist 失败"))
    else if (result.error) setError(toErrorInfo(result.error, "刷新失败，显示缓存内容"))
    else setError(null)
    return result.value
  }

  useEffect(() => {
    load(false)
  }, [gistId])

  const value = gist?.value || null

  async function addFile() {
    if (!value) return
    // 和「创建 Gist」一样同时收文件名 + 内容：
    // GitHub 的 Gist API 在 content 为空字符串时返回 422，所以必须在本地就把内容收齐
    const result = await Navigation.present<GistFileDraft | null>(
      <GistFileDraftView
        filename=""
        content=""
        title="添加文件"
        requireContent
        takenFilenames={value.files.map(file => file.filename)}
      />
    )
    if (!result) return
    const filename = result.filename.trim()
    // 第二重保障：即使将来调用方忘了传 requireContent，也不要把空内容发给 GitHub
    if (!filename || result.content.trim().length === 0) {
      setError(
        validationError(
          "内容不能为空",
          "GitHub 不接受空内容的文件（会返回 422），请先输入内容再保存。"
        )
      )
      return
    }
    const outcome = await createGistFile({ gist: value, filename, content: result.content })
    if (outcome.status === "synced") {
      await load(true)
      emitters.gists.emit()
    } else if (outcome.status === "failed") {
      setError(outcome.info)
    }
  }

  async function renameFile(oldName: string) {
    if (!value) return
    const next = await Dialog.prompt({
      title: "重命名文件",
      defaultValue: oldName,
      confirmLabel: "保存",
    })
    if (!next || next === oldName) return
    const outcome = await renameGistFile({ gist: value, oldName, newName: next.trim() })
    if (outcome.status === "synced") {
      await load(true)
      emitters.gists.emit()
    } else if (outcome.status === "failed") {
      setError(outcome.info)
    }
  }

  async function deleteFile(filename: string) {
    if (!value) return
    const onlyFile = value.files.length <= 1
    const ok = await Dialog.confirm({
      title: `删除 ${filename}？`,
      message: onlyFile
        ? "这是 Gist 里最后一个文件，GitHub 会连同整个 Gist 一起删除。"
        : "此操作会在同步时从 Gist 中删除该文件。",
      confirmLabel: "删除",
    })
    if (!ok) return
    const outcome = await deleteGistFile({ gist: value, filename })
    if (outcome.status === "synced") {
      emitters.gists.emit()
      if (!outcome.gist || outcome.gist.files.length === 0) {
        dismiss(true)
        return
      }
      await load(true)
    } else if (outcome.status === "failed") {
      setError(outcome.info)
    }
  }

  async function editDescription() {
    if (!value) return
    const next = await Dialog.prompt({
      title: "Gist 描述",
      defaultValue: value.description,
      confirmLabel: "保存",
    })
    if (next === null || next === undefined) return
    try {
      const updated = await updateGist({ id: value.id, description: next })
      setGist({ value: updated, ts: Date.now(), fromCache: false, error: null })
      emitters.gists.emit()
    } catch (e) {
      setError(toErrorInfo(e, "修改描述失败"))
    }
  }

  async function deleteThisGist() {
    if (!value) return
    const ok = await Dialog.confirm({
      title: "删除这个 Gist？",
      message: "删除后无法恢复，Gist 中的所有文件都会消失。",
      confirmLabel: "删除",
    })
    if (!ok) return
    const result = await removeGist(value.id, value.description || value.id)
    if (result.ok) {
      emitters.gists.emit()
      dismiss(true)
    } else if (result.info) {
      setError(result.info)
    }
  }

  return (
    <List
      navigationTitle={value ? value.files[0]?.filename || "Gist" : "Gist"}
      navigationBarTitleDisplayMode="inline"
      refreshable={async () => {
        await load(true)
      }}
      toolbar={{
        topBarTrailing: (
          <Menu title="Gist 操作" systemImage="ellipsis.circle">
            <Button title="添加文件" systemImage="doc.badge.plus" action={addFile} />
            <Button title="编辑描述" systemImage="text.alignleft" action={editDescription} />
            <Button
              title="复制 Gist 地址"
              systemImage="doc.on.doc"
              action={async () => {
                await Pasteboard.setString(value?.htmlURL || `https://gist.github.com/${gistId}`)
              }}
            />
            <Button
              title="分享"
              systemImage="square.and.arrow.up"
              action={async () => {
                await ShareSheet.present([value?.htmlURL || `https://gist.github.com/${gistId}`])
              }}
            />
            <Button
              title="在浏览器打开"
              systemImage="safari"
              action={async () => {
                await Safari.openURL(value?.htmlURL || `https://gist.github.com/${gistId}`)
              }}
            />
            <Button title="删除 Gist" systemImage="trash" role="destructive" action={deleteThisGist} />
          </Menu>
        ),
      }}
    >
      {error ? (
        <Section title={error.title}>
          <ErrorBanner info={error} onRetry={() => load(true)} onDismiss={() => setError(null)} />
        </Section>
      ) : null}

      <Section
        header={
          value ? (
            <VStack alignment="leading" spacing={3}>
              <HStack spacing={6}>
                <Text font="headline" lineLimit={1}>
                  {value.files[0]?.filename || "Gist"}
                </Text>
                <Image
                  systemName={value.isPublic ? "globe" : "lock.fill"}
                  imageScale="small"
                  foregroundStyle={value.isPublic ? "systemBlue" : "secondaryLabel"}
                />
                <Spacer />
              </HStack>
              <Text font="footnote" foregroundStyle="secondaryLabel" lineLimit={2}>
                {value.description || "无描述"}
              </Text>
              <Text font="caption" foregroundStyle="tertiaryLabel">
                {`${value.ownerLogin || "我"} · 更新于 ${relativeTime(value.updatedAt)}`}
              </Text>
            </VStack>
          ) : (
            <Text font="footnote" foregroundStyle="secondaryLabel">
              正在加载…
            </Text>
          )
        }
      >
        <HStack spacing={8}>
          <Image systemName="clock" imageScale="small" foregroundStyle="tertiaryLabel" />
          <Text font="footnote" foregroundStyle="secondaryLabel">
            {`创建于 ${value ? relativeTime(value.createdAt) : "—"} · ${value?.files.length ?? 0} 个文件`}
          </Text>
        </HStack>
      </Section>

      <Section
        header={<Text font="footnote" foregroundStyle="secondaryLabel">FILES</Text>}
        footer={<Hint text="点击文件即可编辑，改动会先保存在本地草稿，点「保存」才同步到 GitHub。" />}
      >
        {value === null ? (
          <Text foregroundStyle="secondaryLabel">正在加载文件…</Text>
        ) : (
          value.files.map(file => {
            const draft = getDraft(`gist:${value.id}`, file.filename)
            const dirty = !!draft && draft.state !== "synced" && draft.content !== file.content
            return (
              <NavigationLink
                key={file.filename}
                destination={<GistEditorView gistId={value.id} filename={file.filename} />}
              >
                <HStack
                  spacing={10}
                  contextMenu={{
                    menuItems: (
                      <Group>
                        <Button
                          title="编辑"
                          systemImage="square.and.pencil"
                          action={async () => {
                            await Navigation.present(
                              <GistEditorView gistId={value.id} filename={file.filename} />
                            )
                          }}
                        />
                        <Button
                          title="复制内容"
                          systemImage="doc.on.doc"
                          action={async () => {
                            await Pasteboard.setString(file.content)
                          }}
                        />
                        <Button
                          title="复制 Raw URL"
                          systemImage="link"
                          action={async () => {
                            await Pasteboard.setString(file.rawURL)
                          }}
                        />
                        <Button
                          title="分享 Raw URL"
                          systemImage="square.and.arrow.up"
                          action={async () => {
                            await ShareSheet.present([file.rawURL])
                          }}
                        />
                        <Button
                          title="重命名"
                          systemImage="pencil"
                          action={() => renameFile(file.filename)}
                        />
                        <Button
                          title="删除文件"
                          systemImage="trash"
                          role="destructive"
                          action={() => deleteFile(file.filename)}
                        />
                      </Group>
                    ),
                  }}
                >
                  <Image systemName={fileIcon(file.filename)} foregroundStyle={fileTint(file.filename)} />
                  <VStack alignment="leading" spacing={2}>
                    <Text lineLimit={1}>{file.filename}</Text>
                    <Text font="caption" foregroundStyle="tertiaryLabel">
                      {`${fileSize(file.size)}${file.language ? ` · ${file.language}` : ""}`}
                    </Text>
                  </VStack>
                  <Spacer />
                  {dirty ? (
                    <Text font="caption" foregroundStyle="systemOrange">
                      本地修改
                    </Text>
                  ) : null}
                </HStack>
              </NavigationLink>
            )
          })
        )}
      </Section>
    </List>
  )
}
