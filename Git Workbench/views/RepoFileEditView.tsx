/**
 * 编辑仓库文件并提交（Contents API，真实 Git 提交）。
 * 提交前会带上 blob sha，远程变化时 GitHub 会返回冲突，不会静默覆盖。
 */

import {
  Button,
  Editor,
  Group,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  Section,
  Spacer,
  Text,
  VStack,
  useEffect,
  useMemo,
  useState,
} from "scripting"
import { getFileContent } from "../api/repos"
import { saveRepositoryFile } from "../services/sync"
import { removeDraft, saveDraft } from "../services/drafts"
import { getSettings } from "../services/store"
import { ErrorInfo, toErrorInfo } from "../utils/errors"
import { editorExtTyped } from "../utils/filetype"
import { baseName } from "../utils/format"
import { diffSummary, diffToText, simpleDiff } from "../utils/diff"
import { ErrorBanner, Hint } from "./components"

export function RepoFileEditView({
  owner,
  repo,
  ref,
  path,
  sha,
  baseContent,
  onDone,
}: {
  owner: string
  repo: string
  ref: string
  path: string
  sha: string
  baseContent: string
  onDone: () => void
}) {
  const dismiss = Navigation.useDismiss()
  const targetID = `repo:${owner}/${repo}@${ref}:${path}`
  const [error, setError] = useState<ErrorInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState<{ remote: string; remoteSha: string } | null>(null)
  // 全屏编辑：隐藏上方信息卡片
  const [expanded, setExpanded] = useState(false)

  const controller = useMemo(() => {
    const controller = new EditorController({
      content: baseContent,
      ext: editorExtTyped(baseName(path)),
      readOnly: false,
    })
    controller.onContentChanged = content => {
      if (!getSettings().autoSaveDraft) return
      saveDraft({
        targetID,
        filename: path,
        baseVersion: sha,
        baseContent,
        content,
        state: "local",
      })
    }
    return controller
  }, [targetID, sha])

  useEffect(() => {
    return () => {
      controller.dispose()
    }
  }, [controller])

  async function submit(resolution: "check" | "keep-local", overrideSha?: string) {
    const content = controller.content
    if (content === baseContent && resolution === "check") {
      await Dialog.alert({ title: "没有改动", message: "文件内容与远程一致，无需提交。" })
      return
    }
    const message = await Dialog.prompt({
      title: "提交说明",
      message: `提交到 ${ref}`,
      defaultValue: `Update ${baseName(path)}`,
      confirmLabel: "提交",
    })
    if (message === null || message === undefined) return

    setBusy(true)
    setError(null)
    const outcome = await saveRepositoryFile({
      owner,
      repo,
      path,
      content,
      message,
      sha: overrideSha !== undefined ? overrideSha : sha,
      branch: ref,
    })
    setBusy(false)

    if (outcome.status === "synced") {
      removeDraft(targetID, path)
      onDone()
      dismiss(true)
      return
    }
    if (outcome.status === "conflict") {
      setConflict({ remote: outcome.remoteContent, remoteSha: outcome.remoteVersion })
      setExpanded(false)
      return
    }
    setError(outcome.info)
    setExpanded(false)
  }

  async function keepLocal() {
    // 重新取一次远程 sha，再用本地内容覆盖
    const remote = await getFileContent(owner, repo, path, ref)
    await submit("keep-local", remote.sha)
  }

  return (
    <NavigationStack>
      <VStack
        navigationTitle={baseName(path)}
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="取消" action={() => dismiss(false)} />,
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
              title={busy ? "提交中…" : "提交"}
              action={() => submit("check")}
              disabled={busy}
            />,
          ],
        }}
      >
        {!expanded ? (
          <VStack alignment="leading" spacing={4} padding={{ horizontal: 16, vertical: 8 }}>
            <HStack spacing={8}>
              <Text font="headline" lineLimit={1}>
                {baseName(path)}
              </Text>
              <Spacer />
              <Text font="caption" foregroundStyle="tertiaryLabel">
                {`${controller.content.length} 字符`}
              </Text>
            </HStack>
            <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
              {`${owner}/${repo} · ${ref} · ${path}`}
            </Text>
            <Text font="caption" foregroundStyle="secondaryLabel">
              改动先存在本地草稿，点右上角「提交」才写入 GitHub。
            </Text>
          </VStack>
        ) : null}

        {/* 出错 / 冲突时才占位置，平时把整屏留给编辑器 */}
        {error || conflict ? (
        <List frame={{ maxHeight: 380 }}>
          {error ? (
            <Section title={error.title}>
              <ErrorBanner
                info={error}
                onRetry={() => submit("check")}
                onDismiss={() => setError(null)}
              />
            </Section>
          ) : null}

          {conflict ? (
            <Section
              header={<Text font="footnote" foregroundStyle="secondaryLabel">检测到远程修改</Text>}
              footer={
                <Text font="footnote" foregroundStyle="secondaryLabel">
                  {`差异：+${diffSummary(simpleDiff(conflict.remote, controller.content)).added} / -${diffSummary(simpleDiff(conflict.remote, controller.content)).removed}`}
                </Text>
              }
            >
              <Text font="footnote" foregroundStyle="secondaryLabel">
                服务器上的文件已经变了，请选择保留哪一份。
              </Text>
              <Button
                title="查看差异"
                systemImage="plus.forwardslash.minus"
                action={async () => {
                  await Dialog.alert({
                    title: "差异（远程 → 本地）",
                    message: diffToText(simpleDiff(conflict.remote, controller.content), 40),
                  })
                }}
              />
              <Button
                title="保留本地版本"
                systemImage="arrow.up.doc"
                action={async () => {
                  setConflict(null)
                  await keepLocal()
                }}
              />
              <Button
                title="使用远程版本"
                systemImage="arrow.down.doc"
                action={() => {
                  controller.content = conflict.remote
                  setConflict(null)
                  removeDraft(targetID, path)
                }}
              />
              <Button title="取消" action={() => setConflict(null)} />
            </Section>
          ) : null}

        </List>
        ) : null}

        <Editor
          controller={controller}
          searchEnabled
          showAccessoryView={false}
          dynamicTypeSize={getSettings().editorTextSize}
        />
      </VStack>
    </NavigationStack>
  )
}
