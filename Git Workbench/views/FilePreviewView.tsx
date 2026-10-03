/**
 * 文件预览（§9 / §22 / §23）
 *
 * 只读代码视图使用原生 Editor（等宽字体、行号、语法高亮、查找、选择、分享），
 * Markdown 额外提供「预览」模式。大文件不强行加载完整内容。
 */

import {
  Button,
  Editor,
  Group,
  HStack,
  Image,
  List,
  Markdown,
  Menu,
  Picker,
  ScrollView,
  Section,
  Spacer,
  Text,
  VStack,
  fetch,
  useEffect,
  useMemo,
  useObservable,
  useState,
} from "scripting"
import { FileContent } from "../types"
import { getRawText } from "../api/repos"
import { loadFileContent } from "../services/loaders"
import { getSettings, pushRecent } from "../services/store"
import { ErrorInfo, toErrorInfo } from "../utils/errors"
import { baseName, fileSize, relativeTime } from "../utils/format"
import { editorExtTyped, isMarkdown, isTextLike, languageLabel } from "../utils/filetype"
import { EmptyState, ErrorBanner, Hint } from "./components"
import { RepoFileEditView } from "./RepoFileEditView"

type Loaded<T> = { value: T | null; ts: number; fromCache: boolean; error: unknown | null }

export function FilePreviewView({
  owner,
  repo,
  ref,
  path,
  sha,
  knownSize,
}: {
  owner: string
  repo: string
  ref: string
  path: string
  sha?: string
  knownSize?: number
}) {
  const [result, setResult] = useState<Loaded<FileContent> | null>(null)
  const [error, setError] = useState<ErrorInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<"code" | "preview">("code")
  const [overrideText, setOverrideText] = useState<string | null>(null)
  const editing = useObservable(false)
  // 全屏阅读：隐藏文件信息卡片，把整屏交给代码视图
  const [expanded, setExpanded] = useState(false)

  const filename = baseName(path)
  const rawURL = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`
  const htmlURL = `https://github.com/${owner}/${repo}/blob/${ref}/${path}`
  const markdown = isMarkdown(filename)
  const textLike = isTextLike(filename)
  const settings = getSettings()
  const file = result?.value || null
  const content = overrideText !== null ? overrideText : file?.text || ""
  const size = file?.size ?? knownSize ?? 0
  const oversized = size > settings.maxPreviewBytes && !overrideText

  async function load(force = false) {
    setLoading(true)
    const next = await loadFileContent(owner, repo, ref, path, force)
    setResult(next)
    if (next.error) setError(toErrorInfo(next.error, "读取文件失败"))
    else setError(null)
    setLoading(false)
  }

  useEffect(() => {
    load(false)
    pushRecent({
      kind: "repo_file",
      title: filename,
      subtitle: `${owner}/${repo} · ${ref}`,
      targetID: `${owner}/${repo}`,
      filename: path,
      ref,
    })
  }, [owner, repo, ref, path])

  const ext = editorExtTyped(filename)
  const controller = useMemo(
    () =>
      new EditorController({
        content,
        ext: overrideText !== null ? "txt" : ext,
        readOnly: true,
      }),
    [content, ext, overrideText]
  )

  useEffect(() => {
    return () => {
      controller.dispose()
    }
  }, [controller])

  async function loadRaw() {
    setLoading(true)
    try {
      const text = await getRawText(owner, repo, path, ref)
      setOverrideText(text)
      setMode("code")
      setError(null)
    } catch (e) {
      setError(toErrorInfo(e, "无法获取原始内容"))
    } finally {
      setLoading(false)
    }
  }

  async function download() {
    try {
      const response = await fetch(rawURL, { timeout: 60 })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.data()
      const target = `${FileManager.documentsDirectory}/${filename}`
      await FileManager.writeAsData(target, data)
      await Dialog.alert({
        title: "已下载",
        message: `${filename} 已保存到「文件」App 里的 Scripting 目录。`,
      })
    } catch (e) {
      setError(toErrorInfo(e, "下载失败"))
    }
  }

  const showEditor = !oversized && content.length > 0
  const showTooLarge = oversized && !loading
  const showUnknown = !loading && !textLike && content.length === 0
  /** Markdown 预览模式：只有 Markdown 一个滚动视图，不再与 List 叠在一起 */
  const markdownPreview = showEditor && markdown && mode === "preview"
  /** 紧凑信息头（非贪婪，不会把编辑器顶下去） */
  const showHeader = !expanded

  return (
    <VStack
      navigationTitle={filename}
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        topBarTrailing: [
          ...(markdown
            ? [
                <Button
                  title={mode === "preview" ? "代码" : "预览"}
                  systemImage={
                    mode === "preview" ? "chevron.left.forwardslash.chevron.right" : "eye"
                  }
                  action={() => setMode(mode === "preview" ? "code" : "preview")}
                />,
              ]
            : []),
          ...(showEditor
            ? [
                <Button action={() => setExpanded(!expanded)}>
                  <Image
                    systemName={
                      expanded
                        ? "arrow.down.right.and.arrow.up.left"
                        : "arrow.up.left.and.arrow.down.right"
                    }
                  />
                </Button>,
              ]
            : []),
          <Menu title="文件操作" systemImage="ellipsis.circle">
            <Button
              title="复制原始内容"
              systemImage="doc.on.doc"
              action={async () => {
                await Pasteboard.setString(content)
              }}
            />
            <Button title="下载文件" systemImage="arrow.down.circle" action={download} />
            <Button
              title="分享内容"
              systemImage="square.and.arrow.up"
              action={async () => {
                await ShareSheet.present([content || rawURL])
              }}
            />
            <Button
              title="复制 Raw URL"
              systemImage="link"
              action={async () => {
                await Pasteboard.setString(rawURL)
              }}
            />
            <Button
              title="在浏览器打开 Raw"
              systemImage="safari"
              action={async () => {
                await Safari.openURL(rawURL)
              }}
            />
            <Button
              title="在 GitHub 打开"
              systemImage="arrow.up.right.square"
              action={async () => {
                await Safari.openURL(htmlURL)
              }}
            />
            <Button
              title="编辑并提交"
              systemImage="square.and.pencil"
              action={() => editing.setValue(true)}
            />
          </Menu>,
        ],
      }}
      sheet={{
        isPresented: editing,
        content: (
          <RepoFileEditView
            owner={owner}
            repo={repo}
            ref={ref}
            path={path}
            sha={sha || file?.sha || ""}
            baseContent={content}
            onDone={() => load(true)}
          />
        ),
      }}
    >
      {showHeader ? (
        <VStack alignment="leading" spacing={6} padding={{ horizontal: 16, vertical: 8 }}>
          <HStack spacing={8}>
            <Text font="headline" lineLimit={1}>
              {filename}
            </Text>
            <Spacer />
            <Text font="footnote" foregroundStyle="secondaryLabel">
              {fileSize(size)}
            </Text>
          </HStack>
          <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
            {path}
          </Text>
          <HStack spacing={8}>
            <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
              {`${languageLabel(filename)} · ${content.length} 个字符`}
            </Text>
            <Spacer />
            {result ? (
              <Text font="caption" foregroundStyle="tertiaryLabel">
                {`${result.fromCache ? "缓存于" : "更新于"} ${relativeTime(result.ts)}`}
              </Text>
            ) : null}
          </HStack>
          {markdown ? (
            <Picker
              title="显示方式"
              value={mode}
              onChanged={(value: string) => setMode(value === "preview" ? "preview" : "code")}
              pickerStyle="segmented"
            >
              <Text tag="code">代码</Text>
              <Text tag="preview">预览</Text>
            </Picker>
          ) : null}
          {error ? (
            <HStack spacing={8}>
              <Image
                systemName="exclamationmark.triangle"
                imageScale="small"
                foregroundStyle="systemOrange"
              />
              <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
                {error.title}
              </Text>
              <Spacer />
              <Button title="重试" buttonStyle="borderless" action={() => load(true)} />
            </HStack>
          ) : null}
        </VStack>
      ) : null}

      {showEditor ? (
        markdownPreview ? (
          <ScrollView>
            <Markdown
              content={content}
              theme="github"
              useDefaultHighlighterTheme
              scrollable={false}
            />
          </ScrollView>
        ) : (
          <Editor
            controller={controller}
            searchEnabled
            exportEnabled
            showAccessoryView={false}
            dynamicTypeSize={settings.editorTextSize}
          />
        )
      ) : (
      <List>
        {error ? (
          <Section title={error.title}>
            <ErrorBanner info={error} onRetry={() => load(true)} onDismiss={() => setError(null)} />
          </Section>
        ) : null}

        {loading && !file ? (
          <Section>
            <HStack spacing={10}>
              <Image systemName="arrow.triangle.2.circlepath" foregroundStyle="secondaryLabel" />
              <Text foregroundStyle="secondaryLabel">正在读取文件…</Text>
            </HStack>
          </Section>
        ) : null}

        {showTooLarge ? (
          <Section title="文件较大">
            <EmptyState
              icon="exclamationmark.triangle"
              title="超过 2 MB，默认不加载编辑器"
              message="可以查看原始内容，或下载后在其他 App 中打开。"
            />
            <HStack spacing={12}>
              <Button title="查看原始内容" systemImage="doc.plaintext" action={loadRaw} />
              <Button title="下载文件" systemImage="arrow.down.circle" action={download} />
            </HStack>
          </Section>
        ) : null}

        {showUnknown ? (
          <Section title="无法预览">
            <EmptyState
              icon="doc.zipper"
              title="无法预览此文件"
              message="这个文件类型不支持在线预览，可以查看原始内容或下载到本地。"
            />
            <HStack spacing={12}>
              <Button title="查看原始内容" systemImage="doc.plaintext" action={loadRaw} />
              <Button title="下载文件" systemImage="arrow.down.circle" action={download} />
            </HStack>
          </Section>
        ) : null}

        {content.length > 0 ? (
          <Section footer={<Hint text="仓库文件默认只读；长按可以选择文本，右上角菜单里可以「编辑并提交」。" />}>
            <Text font="footnote" foregroundStyle="secondaryLabel">
              {`${path} · ${languageLabel(filename)}`}
            </Text>
          </Section>
        ) : null}
      </List>
      )}
    </VStack>
  )
}
