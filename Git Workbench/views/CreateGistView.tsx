/** 创建 Gist（§15） */

import {
  Button,
  Editor,
  Group,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  Picker,
  Section,
  Spacer,
  Text,
  TextField,
  VStack,
  useEffect,
  useMemo,
  useState,
} from "scripting"
import { createNewGist } from "../services/sync"
import { ErrorInfo, validationError } from "../utils/errors"
import { editorExtTyped } from "../utils/filetype"
import { baseName, fileSize } from "../utils/format"
import { getSettings } from "../services/store"
import { ErrorBanner, Hint } from "./components"

type DraftFile = GistFileDraft

export function CreateGistView({ onCreated }: { onCreated: () => Promise<void> | void }) {
  const dismiss = Navigation.useDismiss()
  const [description, setDescription] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [files, setFiles] = useState<DraftFile[]>([{ filename: "script.js", content: "" }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorInfo | null>(null)

  async function editFile(index: number | null) {
    const current = index === null ? { filename: "", content: "" } : files[index]
    // 同一 Gist 里不能有同名文件；排除当前这条，避免自己和自己冲突
    const taken = files
      .filter((_, i) => i !== index)
      .map(file => file.filename.trim())
      .filter(item => item.length > 0)
    const result = await Navigation.present<DraftFile | null>(
      <GistFileDraftView
        filename={current.filename}
        content={current.content}
        title={index === null ? "添加文件" : undefined}
        requireContent
        takenFilenames={taken}
      />
    )
    if (!result) return
    if (index === null) {
      setFiles(prev => [...prev, result])
    } else {
      setFiles(prev => prev.map((file, i) => (i === index ? result : file)))
    }
  }

  async function create() {
    const payload = files
      .map(file => ({ filename: file.filename.trim(), content: file.content }))
      .filter(file => file.filename.length > 0)
    if (payload.length === 0) {
      setError(validationError("还没有文件", "Gist 至少要有一个文件，例如 script.js。"))
      return
    }
    // 防呆：GitHub 对 content 为空字符串的文件会返回 422，先在本地拦住
    const emptyFile = payload.find(file => file.content.trim().length === 0)
    if (emptyFile) {
      const info = validationError(
        "内容不能为空",
        `「${emptyFile.filename}」还没有输入内容。GitHub 不接受空内容的文件（会返回 422），请点开它输入内容后再创建。`
      )
      setError(info)
      await Dialog.alert({ title: info.title, message: info.message, buttonLabel: "好" })
      return
    }
    setBusy(true)
    setError(null)
    const result = await createNewGist({ description, isPublic, files: payload })
    setBusy(false)
    if (result.ok) {
      await onCreated()
      dismiss(true)
    } else {
      setError(result.info)
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="创建 Gist"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="取消" action={() => dismiss(false)} />,
          confirmationAction: (
            <Button title={busy ? "创建中…" : "创建"} action={create} disabled={busy} />
          ),
        }}
      >
        <Section
          header={<Text font="footnote" foregroundStyle="secondaryLabel">描述</Text>}
          footer={<Hint text="描述可以留空，之后在详情页也能修改。" />}
        >
          <TextField
            title="描述"
            prompt="这个 Gist 是做什么的"
            value={description}
            onChanged={setDescription}
          />
        </Section>

        <Section
          header={<Text font="footnote" foregroundStyle="secondaryLabel">文件</Text>}
          footer={<Hint text="点击文件名进入编辑器，编辑完点「完成」回到这里。" />}
        >
          {files.map((file, index) => (
            <Button
              key={`${file.filename}-${index}`}
              buttonStyle="plain"
              action={() => editFile(index)}
            >
              <HStack spacing={10}>
                <Image systemName="doc.text" foregroundStyle="systemPurple" />
                <VStack alignment="leading" spacing={2}>
                  <Text lineLimit={1}>{file.filename || "未命名文件"}</Text>
                  <Text font="caption" foregroundStyle="tertiaryLabel">
                    {`${fileSize(file.content.length)}${file.content.length > 0 ? "" : " · 空文件"}`}
                  </Text>
                </VStack>
                <Spacer />
                <Image systemName="chevron.right" imageScale="small" foregroundStyle="tertiaryLabel" />
              </HStack>
            </Button>
          ))}
          <Button title="添加文件" systemImage="plus" action={() => editFile(null)} />
        </Section>

        <Section
          header={<Text font="footnote" foregroundStyle="secondaryLabel">Visibility</Text>}
          footer={<Hint text="Secret Gist 不会出现在公开列表里，但拿到链接的人仍然可以访问。" />}
        >
          <Picker
            title="可见性"
            value={isPublic ? "public" : "secret"}
            onChanged={(value: string) => setIsPublic(value === "public")}
            pickerStyle="inline"
          >
            <Text tag="public">Public</Text>
            <Text tag="secret">Secret</Text>
          </Picker>
        </Section>

        {error ? (
          <Section title={error.title}>
            <ErrorBanner info={error} onRetry={create} onDismiss={() => setError(null)} />
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  )
}

/**
 * 单个文件的内容编辑器：创建 Gist 时的新文件、向已有 Gist 添加文件都走这里。
 *
 * 为什么必须同时填内容：GitHub 的 Gist API 在 content 为空字符串时返回 422，
 * 所以这里把「文件名 + 内容」一起收齐，并在缺少内容时拒绝保存（防呆）。
 */
export type GistFileDraft = { filename: string; content: string }

export function GistFileDraftView({
  filename,
  content,
  title,
  requireContent = false,
  takenFilenames = [],
  onDone,
}: {
  filename: string
  content: string
  /** 页面标题（例如「添加文件」）；填了文件名后优先显示文件名 */
  title?: string
  /** 开启后内容为空会拒绝保存：GitHub 不接受空内容的文件（422） */
  requireContent?: boolean
  /** 同一 Gist 内已占用的文件名，用于同名防呆 */
  takenFilenames?: string[]
  onDone?: (file: GistFileDraft) => void
}) {
  const dismiss = Navigation.useDismiss()
  const [name, setName] = useState(filename)
  const [current, setCurrent] = useState(content)
  const [problem, setProblem] = useState<ErrorInfo | null>(null)
  // 全屏编辑：隐藏上方文件信息卡片
  const [expanded, setExpanded] = useState(false)

  // 编辑器只创建一次：语法高亮按打开时的文件名决定，之后改名不重建控制器
  const controller = useMemo(() => {
    const instance = new EditorController({
      content,
      ext: editorExtTyped(baseName(filename)),
      readOnly: false,
    })
    instance.onContentChanged = text => {
      setCurrent(text)
      setProblem(prev => (prev ? null : prev))
    }
    return instance
  }, [])

  useEffect(() => {
    return () => {
      controller.dispose()
    }
  }, [controller])

  const contentMissing = requireContent && current.trim().length === 0

  function changeName(value: string) {
    setName(value)
    setProblem(prev => (prev ? null : prev))
  }

  /** 防呆：收起头部露出提示，页面上留下红色横幅，再弹窗强制确认 */
  async function complain(info: ErrorInfo) {
    setExpanded(false)
    setProblem(info)
    await Dialog.alert({ title: info.title, message: info.message, buttonLabel: "好" })
  }

  async function finish() {
    const nextName = name.trim()
    if (!nextName) {
      await complain(validationError("请填写文件名", "文件名不能为空，例如 config.json。"))
      return
    }
    if (takenFilenames.some(item => item.toLowerCase() === nextName.toLowerCase())) {
      await complain(
        validationError("文件名已存在", `Gist 里已经有「${nextName}」了，请换一个名字。`)
      )
      return
    }
    if (contentMissing) {
      await complain(
        validationError(
          "内容不能为空",
          "GitHub 不接受空内容的文件（会返回 422），请先在编辑器里输入内容，再点「完成」。"
        )
      )
      return
    }
    const file: GistFileDraft = { filename: nextName, content: current }
    setProblem(null)
    if (onDone) onDone(file)
    dismiss(file)
  }

  return (
    <NavigationStack>
      <VStack
        navigationTitle={name.trim() || title || "文件"}
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="取消" action={() => dismiss(null)} />,
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
            <Button title="完成" action={finish} />,
          ],
        }}
      >
        {expanded ? (
          <HStack spacing={8} padding={{ horizontal: 16, vertical: 4 }}>
            <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
              {name.trim() || "未命名文件"}
            </Text>
            <Spacer />
            {contentMissing ? (
              <Text font="caption" foregroundStyle="systemOrange">
                内容为空，无法保存
              </Text>
            ) : null}
            <Text font="caption" foregroundStyle="tertiaryLabel">
              {`${current.length} 个字符`}
            </Text>
          </HStack>
        ) : (
        <List frame={{ maxHeight: 200 }}>
          <Section
            header={<Text font="footnote" foregroundStyle="secondaryLabel">文件名</Text>}
            footer={
              <Hint
                text={
                  requireContent
                    ? "扩展名决定语法高亮（.json / .js / .md / .py）。注意：GitHub 不接受空内容的文件，内容必须填写。"
                    : "扩展名决定语法高亮，例如 .json / .js / .md / .py。"
                }
              />
            }
          >
            <TextField
              title="名称"
              value={name}
              onChanged={changeName}
              autocorrectionDisabled
            />
            <Text
              font="caption"
              foregroundStyle={contentMissing ? "systemOrange" : "tertiaryLabel"}
            >
              {contentMissing ? "内容为空，无法保存到 GitHub" : `${current.length} 个字符`}
            </Text>
          </Section>

          {problem ? (
            <Section title={problem.title}>
              <ErrorBanner info={problem} onDismiss={() => setProblem(null)} />
            </Section>
          ) : null}
        </List>
        )}

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
