/**
 * Gist 编辑器（§17 / §18 / §19 / §44）
 *
 * 优先级：① 不丢内容 ② 打开速度 ③ 输入流畅
 * - 每次改动只写本地草稿（去抖 600ms），绝不发网络请求
 * - 点「保存」才同步；保存前检查远程版本，发现冲突就交给用户决定
 * - 网络失败时内容留在本地并标记「同步失败」，可重试
 */

import {
  Button,
  Editor,
  HStack,
  Image,
  List,
  Menu,
  Section,
  Spacer,
  Text,
  VStack,
  useEffect,
  useMemo,
  useState,
} from "scripting"
import { Gist, SyncState } from "../types"
import { loadGist } from "../services/loaders"
import { getDraft, removeDraft, saveDraft } from "../services/drafts"
import { saveGistFile } from "../services/sync"
import { getSettings } from "../services/store"
import { emitters } from "../utils/emitter"
import { ErrorInfo } from "../utils/errors"
import { diffSummary, diffToText, simpleDiff } from "../utils/diff"
import { editorExtTyped, symbolKeys } from "../utils/filetype"
import { fileSize, relativeTime, timeOnly } from "../utils/format"
import { ErrorBanner, Hint, SyncBadge } from "./components"

let draftTimer: any = null

export function GistEditorView({ gistId, filename }: { gistId: string; filename: string }) {
  const targetID = `gist:${gistId}`
  const [gist, setGist] = useState<Gist | null>(null)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [initialContent, setInitialContent] = useState("")
  const [remoteContent, setRemoteContent] = useState("")
  const [baseVersion, setBaseVersion] = useState("")
  const [state, setState] = useState<SyncState>("synced")
  const [error, setError] = useState<ErrorInfo | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<{ remoteContent: string; remoteVersion: string } | null>(null)
  const [restored, setRestored] = useState(false)
  const [lastLocalSave, setLastLocalSave] = useState(0)
  // 全屏编辑：隐藏上方状态卡片，把整屏交给编辑器
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const result = await loadGist(gistId, false)
      if (cancelled) return
      const value = result.value
      if (!value) {
        setLoading(false)
        setError({
          title: "无法打开 Gist",
          message: "可能是网络问题或 Gist 已被删除。",
          detail: result.error ? String(result.error) : "",
          httpStatus: 0,
          retryable: true,
          conflict: false,
        })
        return
      }
      const file = value.files.find(item => item.filename === filename)
      const remote = file ? file.content : ""
      const draft = getDraft(targetID, filename)
      setGist(value)
      setRemoteContent(remote)
      setBaseVersion(value.updatedAt)
      if (draft && draft.content !== remote) {
        setInitialContent(draft.content)
        setRestored(true)
        setLastLocalSave(draft.updatedAt)
        setState(draft.state === "synced" ? "local" : draft.state)
      } else {
        setInitialContent(remote)
        setState("synced")
      }
      setLoading(false)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [gistId, filename])

  const controller = useMemo(() => {
    if (!ready) return null
    const instance = new EditorController({
      content: initialContent,
      ext: editorExtTyped(filename),
      readOnly: false,
    })
    instance.onContentChanged = text => {
      const dirty = text !== remoteContent
      setState(prev => (prev === "syncing" ? prev : dirty ? "local" : "synced"))
      if (draftTimer) clearTimeout(draftTimer)
      if (!getSettings().autoSaveDraft) return
      draftTimer = setTimeout(() => {
        draftTimer = null
        saveDraft({
          targetID,
          filename,
          baseVersion,
          baseContent: remoteContent,
          content: text,
          state: text === remoteContent ? "synced" : "local",
        })
        setLastLocalSave(Date.now())
        emitters.drafts.emit(`${gistId}:${filename}`)
      }, 600)
    }
    return instance
  }, [ready, initialContent, filename])

  useEffect(() => {
    return () => {
      if (draftTimer) {
        clearTimeout(draftTimer)
        draftTimer = null
      }
      if (controller) controller.dispose()
    }
  }, [controller])

  async function save(resolution: "check" | "keep-local" = "check") {
    if (!gist || !controller) return
    const content = controller.content
    setSaving(true)
    setState("syncing")
    setError(null)
    const outcome = await saveGistFile({
      gist,
      filename,
      content,
      baseVersion,
      resolution,
    })
    setSaving(false)

    if (outcome.status === "synced") {
      if (draftTimer) {
        clearTimeout(draftTimer)
        draftTimer = null
      }
      removeDraft(targetID, filename)
      setGist(outcome.gist || gist)
      setRemoteContent(content)
      setBaseVersion((outcome.gist && outcome.gist.updatedAt) || baseVersion)
      setState("synced")
      setConflict(null)
      setRestored(false)
      emitters.gists.emit()
      emitters.drafts.emit("")
      return
    }

    if (outcome.status === "conflict") {
      setConflict({ remoteContent: outcome.remoteContent, remoteVersion: outcome.remoteVersion })
      setState("conflict")
      setExpanded(false)
      saveDraft({
        targetID,
        filename,
        baseVersion,
        baseContent: remoteContent,
        content,
        state: "conflict",
      })
      return
    }

    setState("failed")
    setError(outcome.info)
    setExpanded(false)
    saveDraft({
      targetID,
      filename,
      baseVersion,
      baseContent: remoteContent,
      content,
      state: "failed",
      error: outcome.info.title,
    })
    setLastLocalSave(Date.now())
  }

  function useRemoteVersion() {
    if (!conflict || !controller) return
    controller.content = conflict.remoteContent
    setRemoteContent(conflict.remoteContent)
    setBaseVersion(conflict.remoteVersion || baseVersion)
    removeDraft(targetID, filename)
    setConflict(null)
    setRestored(false)
    setState("synced")
  }

  function discardLocal() {
    if (!controller) return
    controller.content = remoteContent
    removeDraft(targetID, filename)
    setRestored(false)
    setState("synced")
  }

  const contentLength = controller ? controller.content.length : initialContent.length
  const fileMeta = gist?.files.find(item => item.filename === filename)
  const diff = conflict && controller ? simpleDiff(conflict.remoteContent, controller.content) : null
  const settings = getSettings()

  function insertSymbol(key: string) {
    if (!controller) return
    if (key === "\n") {
      let text = "\n"
      if (getSettings().autoIndent) {
        const lines = controller.content.split("\n")
        const last = lines[lines.length - 1] || ""
        const match = last.match(/^[ \t]*/)
        if (match) text += match[0]
      }
      controller.replaceSelection(text)
      return
    }
    // Tab 键：按设置插入对应数量的空格
    controller.replaceSelection(key.trim().length === 0 ? " ".repeat(getSettings().tabWidth) : key)
  }

  return (
    <VStack
      navigationTitle={filename}
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        topBarTrailing: [
          <Button action={() => setExpanded(!expanded)}>
            <Image
              systemName={
                expanded
                  ? "arrow.down.right.and.arrow.up.left"
                  : "arrow.up.left.and.arrow.down.right"
              }
            />
          </Button>,
          <Button
            title={saving ? "同步中…" : "保存"}
            action={() => save("check")}
            disabled={saving || !ready}
          />,
          <Menu title="更多" systemImage="ellipsis.circle">
            <Button title="撤销" systemImage="arrow.uturn.backward" action={() => controller?.undo()} />
            <Button title="重做" systemImage="arrow.uturn.forward" action={() => controller?.redo()} />
            <Button title="全选" systemImage="text.cursor" action={() => controller?.selectAll()} />
            <Button title="自动缩进" systemImage="increase.indent" action={() => controller?.replaceSelection("  ")} />
            <Button
              title="复制全部内容"
              systemImage="doc.on.doc"
              action={async () => {
                await Pasteboard.setString(controller ? controller.content : initialContent)
              }}
            />
            <Button title="丢弃本地修改" systemImage="arrow.counterclockwise" role="destructive" action={discardLocal} />
            <Button
              title="复制 Raw URL"
              systemImage="link"
              action={async () => {
                await Pasteboard.setString(fileMeta?.rawURL || gist?.htmlURL || "")
              }}
            />
          </Menu>,
        ],
        keyboard: (
          <HStack spacing={4}>
            {symbolKeys(filename).map((key, index) => (
              <Button
                key={`symbol-${index}`}
                title={key === "\n" ? "↩" : key.trim().length === 0 ? "⇥" : key}
                buttonStyle="borderless"
                action={() => insertSymbol(key)}
              />
            ))}
            <Spacer />
            <Button
              title="完成"
              buttonStyle="borderless"
              action={() => Keyboard.hide()}
            />
          </HStack>
        ),
      }}
    >
      {!expanded ? (
        <VStack alignment="leading" spacing={4} padding={{ horizontal: 16, vertical: 8 }}>
          <HStack spacing={8}>
            <SyncBadge state={state} error={error ? error.title : undefined} />
            <Spacer />
            <Text font="caption" foregroundStyle="tertiaryLabel">
              {`${fileSize(fileMeta?.size || contentLength)} · ${contentLength} 字符`}
            </Text>
          </HStack>
          <HStack spacing={8}>
            <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
              {gist
                ? `远程版本 ${relativeTime(baseVersion)} · ${gist.isPublic ? "Public" : "Secret"}`
                : filename}
            </Text>
            <Spacer />
            {lastLocalSave > 0 ? (
              <Text font="caption" foregroundStyle="tertiaryLabel">
                {`草稿 ${timeOnly(lastLocalSave)}`}
              </Text>
            ) : null}
          </HStack>
          {restored ? (
            <Text font="caption" foregroundStyle="systemOrange">
              已恢复未同步的本地修改，尚未上传到 GitHub
            </Text>
          ) : null}
          {loading ? (
            <Text font="caption" foregroundStyle="secondaryLabel">
              正在打开文件…
            </Text>
          ) : null}
        </VStack>
      ) : null}

      {/* 出错 / 冲突时才占位置，平时把整屏留给编辑器 */}
      {error || (conflict && diff) ? (
        <List frame={{ maxHeight: 380 }}>
          {error ? (
            <Section title={error.title}>
              <ErrorBanner
                info={error}
                onRetry={() => save("check")}
                onDismiss={() => setError(null)}
              />
              <HStack spacing={12}>
                <Button title="稍后同步" action={() => setError(null)} buttonStyle="bordered" />
              </HStack>
            </Section>
          ) : null}

          {conflict && diff ? (
            <Section
              header={<Text font="footnote" foregroundStyle="secondaryLabel">检测到远程修改</Text>}
              footer={
                <Text font="footnote" foregroundStyle="secondaryLabel">
                  {`差异（远程 → 本地）：+${diffSummary(diff).added} / -${diffSummary(diff).removed}`}
                </Text>
              }
            >
              <Text font="footnote" foregroundStyle="secondaryLabel">
                这个 Gist 在别处被修改过。请选择保留哪一份，或先看看差异。
              </Text>
              <Button
                title="查看差异"
                systemImage="plus.forwardslash.minus"
                action={async () => {
                  await Dialog.alert({
                    title: "差异（远程 → 本地）",
                    message: diffToText(diff, 40),
                  })
                }}
              />
              <Button
                title="保留本地版本"
                systemImage="arrow.up.doc"
                action={() => save("keep-local")}
              />
              <Button title="使用远程版本" systemImage="arrow.down.doc" action={useRemoteVersion} />
              <Button
                title="取消"
                action={() => {
                  setConflict(null)
                  setState("local")
                }}
              />
            </Section>
          ) : null}
        </List>
      ) : null}

      {controller ? (
        <Editor
          controller={controller}
          searchEnabled
          showAccessoryView={false}
          dynamicTypeSize={settings.editorTextSize}
        />
      ) : null}
    </VStack>
  )
}
