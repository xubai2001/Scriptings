import {
  Button,
  Form,
  HStack,
  Menu,
  Navigation,
  NavigationStack,
  ScrollView,
  Text,
  TextField,
  VStack,
  ZStack,
  useEffect,
  useRef,
  useState,
} from "scripting"

declare const Clipboard: { copyText(text: string): Promise<void> }
declare const HapticFeedback: { lightImpact(): void }
declare function setTimeout(callback: () => void, ms: number): number
declare function clearTimeout(id: number): void

type Capture = { name: string; value: string }
type Match = { value: string; index: number; captures: Capture[] }
type Result = { matches: Match[]; error: string; groupCount: number }
type HelpHighlight = { start: number; end: number; color?: string; backgroundColor?: string }
type HelpExample = { title: string; description: string; pattern: string; text: string; highlights: HelpHighlight[] }

function loadHelpExamples(): { examples: HelpExample[]; error: string } {
  try {
    const path = `${FileManager.scriptsDirectory}/小工具合集/regex_help.json`
    const raw = FileManager.readAsStringSync(path)
    const parsed = JSON.parse(raw) as any
    if (!parsed || !Array.isArray(parsed.examples)) return { examples: [], error: "帮助文件格式异常：缺少 examples 数组" }
    const examples: HelpExample[] = []
    let skippedExamples = 0
    let skippedHighlights = 0
    for (const item of parsed.examples) {
      if (!item || typeof item.title !== "string" || typeof item.description !== "string" || typeof item.pattern !== "string" || typeof item.text !== "string") {
        skippedExamples += 1
        continue
      }
      const rawHighlights = Array.isArray(item.highlights) ? item.highlights : []
      if (!Array.isArray(item.highlights) && item.highlights != null) skippedHighlights += 1
      const validHighlights = rawHighlights.filter((part: any) => part && Number.isInteger(part.start) && Number.isInteger(part.end) && part.start >= 0 && part.end > part.start && part.end <= item.text.length)
      skippedHighlights += rawHighlights.length - validHighlights.length
      const highlights = validHighlights.map((part: any) => ({
        start: part.start,
        end: part.end,
        color: typeof part.color === "string" ? part.color : "systemOrange",
        backgroundColor: typeof part.backgroundColor === "string" ? part.backgroundColor : "systemYellow",
      }))
      examples.push({ title: item.title, description: item.description, pattern: item.pattern, text: item.text, highlights })
    }
    const warnings = [skippedExamples ? `跳过 ${skippedExamples} 条异常示例` : "", skippedHighlights ? `跳过 ${skippedHighlights} 个异常高亮区间` : ""].filter(Boolean).join("；")
    return { examples, error: examples.length ? warnings : (warnings || "帮助文件中没有可用示例") }
  } catch (error: any) {
    return { examples: [], error: `帮助文件格式异常：${String(error?.message ?? error)}` }
  }
}

function styledHelpText(example: HelpExample) {
  const parts: any[] = []
  let cursor = 0
  for (const mark of example.highlights.sort((a, b) => a.start - b.start)) {
    if (mark.start < cursor) continue
    if (mark.start > cursor) parts.push({ content: example.text.slice(cursor, mark.start), foregroundColor: "label" })
    parts.push({ content: example.text.slice(mark.start, mark.end), foregroundColor: mark.color ?? "systemOrange", backgroundColor: mark.backgroundColor ?? "systemYellow" })
    cursor = mark.end
  }
  if (cursor < example.text.length) parts.push({ content: example.text.slice(cursor), foregroundColor: "label" })
  return parts.length ? parts : [{ content: example.text, foregroundColor: "label" }]
}

function copyText(value: string) {
  if (!value) return
  void Clipboard.copyText(value).then(() => HapticFeedback.lightImpact()).catch(() => undefined)
}

function countCapturingGroups(source: string): number {
  let count = 0
  let escaped = false
  let inClass = false
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    if (escaped) { escaped = false; continue }
    if (ch === "\\") { escaped = true; continue }
    if (ch === "[") { inClass = true; continue }
    if (ch === "]") { inClass = false; continue }
    if (!inClass && ch === "(" && source[i + 1] !== "?" ) count += 1
    if (!inClass && source.slice(i, i + 4) === "(?<" && source[i + 3] !== "=" && source[i + 3] !== "!") count += 1
  }
  return count
}

function calculate(pattern: string, text: string, flags: string): Result {
  if (!pattern.trim()) return { matches: [], error: "", groupCount: 0 }
  try {
    const regex = new RegExp(pattern, flags.includes("g") ? flags : `${flags}g`)
    const matches: Match[] = []
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        value: match[0],
        index: match.index,
        captures: match.slice(1).map((value, index) => ({ name: `第${index + 1}组`, value: value ?? "未匹配" })),
      })
      if (!flags.includes("g")) break
      if (match[0] === "") regex.lastIndex += 1
    }
    return { matches, error: "", groupCount: countCapturingGroups(pattern) }
  } catch (error: any) {
    return { matches: [], error: String(error?.message ?? error), groupCount: 0 }
  }
}

function styledPreview(text: string, matches: Match[], onMatch: (value: string) => void) {
  if (!matches.length) return [{ content: text }]
  const parts: any[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.index > cursor) parts.push({ content: text.slice(cursor, match.index) })
    parts.push({
      content: match.value || "空匹配",
      foregroundColor: "#7C3A00",
      backgroundColor: "#F6B94A",
      onTapGesture: () => onMatch(match.value),
    })
    cursor = match.index + match.value.length
  }
  if (cursor < text.length) parts.push({ content: text.slice(cursor) })
  return parts
}

export function RegexEditorView(props: { item?: any; isNew?: boolean; standalone?: boolean }) {
  const dismiss = Navigation.useDismiss()
  const [pattern, setPattern] = useState(props.item?.pattern ?? "\\d+")
  const [text, setText] = useState(props.item?.sampleText ?? "订单号 1001，金额 25 元。")
  const [replacement, setReplacement] = useState("")
  const [globalFlag, setGlobalFlag] = useState(true)
  const [ignoreCase, setIgnoreCase] = useState(false)
  const [multiline, setMultiline] = useState(false)
  const [replaceMode, setReplaceMode] = useState(false)
  const [groupsExpanded, setGroupsExpanded] = useState(true)
  const help = loadHelpExamples()
  const [helpExamples] = useState<HelpExample[]>(help.examples)
  const [result, setResult] = useState<Result>(() => calculate(pattern, text, "g"))
  const timer = useRef<any>(null)

  const flags = `${globalFlag ? "g" : ""}${ignoreCase ? "i" : ""}${multiline ? "m" : ""}`
  const replacementPreview = (() => {
    if (!replaceMode || result.error || !pattern) return ""
    try { return text.replace(new RegExp(pattern, flags), replacement) } catch { return "" }
  })()

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const update = () => setResult(calculate(pattern, text, flags))
    if (text.length > 5000) timer.current = setTimeout(update, 300)
    else update()
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [pattern, text, flags])

  const allCaptures = result.matches.flatMap((match, index) => match.captures.map((capture) => ({ ...capture, matchIndex: index })))

  return (
    <NavigationStack>
      <ScrollView
        navigationTitle="正则实验室"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          topBarLeading: props.standalone ? <Button title="关闭" role="close" action={dismiss} /> : undefined,
        }}
        scrollDismissesKeyboard="immediately"
        contentMargins={{ insets: 14 }}
      >
        <VStack spacing={10} frame={{ maxWidth: "infinity", alignment: "topLeading" }}>
          <VStack spacing={6} padding={12} background={{ style: "tertiarySystemBackground", shape: { type: "rect", cornerRadius: 14 } }}>
            <HStack frame={{ maxWidth: "infinity" }}>
              <Text font="caption" foregroundStyle="systemTeal" fontWeight="semibold">测试文本</Text>
              <Text font="caption2" foregroundStyle="secondaryLabel">高亮预览</Text>
            </HStack>
            <VStack spacing={6}>
              <ZStack alignment="topLeading" frame={{ minHeight: 112, maxWidth: "infinity" }} background="secondarySystemBackground" clipShape={{ type: "rect", cornerRadius: 10 }}>
                <TextField
                  title=""
                  value={text}
                  axis="vertical"
                  prompt="输入测试文本..."
                  onChanged={setText}
                  padding={10}
                  monospaced
                  frame={{ minHeight: 112, maxWidth: "infinity", alignment: "topLeading" }}
                  textFieldStyle="plain"
                  autocorrectionDisabled
                />
              </ZStack>
              <VStack spacing={4} padding={8} background="tertiarySystemBackground" clipShape={{ type: "rect", cornerRadius: 8 }}>
                <Text font="caption2" foregroundStyle="systemTeal">匹配高亮预览</Text>
                <Text
                  frame={{ minHeight: 28, maxWidth: "infinity", alignment: "topLeading" }}
                  multilineTextAlignment="leading"
                  monospaced
                  styledText={result.error ? { content: "等待有效正则", foregroundColor: "systemRed" } : text ? { content: replaceMode ? replacementPreview : styledPreview(text, result.matches, copyText) } : { content: "输入文本后，匹配内容会在这里高亮", foregroundColor: "secondaryLabel" }}
                />
              </VStack>
            </VStack>
            <HStack spacing={6} frame={{ maxWidth: "infinity" }}>
              <Text font="caption2" foregroundStyle={result.error ? "systemRed" : "systemTeal"}>{result.error ? result.error : `匹配 ${result.matches.length} 项`}</Text>
              <Text font="caption2" foregroundStyle="secondaryLabel">实时更新</Text>
              <Button title={replaceMode ? "替换中" : "替换"} systemImage="arrow.left.arrow.right" action={() => setReplaceMode(!replaceMode)} buttonStyle={replaceMode ? "borderedProminent" : "borderless"} />
            </HStack>
            {replaceMode ? <TextField title="替换为" value={replacement} prompt="替换文本" onChanged={setReplacement} textFieldStyle="roundedBorder" /> : null}
          </VStack>

          <VStack spacing={6} padding={12} background={{ style: "secondarySystemBackground", shape: { type: "rect", cornerRadius: 14 } }}>
            <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
              <Text font="caption" foregroundStyle="systemOrange" fontWeight="semibold">正则表达式</Text>
              <Text font="caption2" foregroundStyle="secondaryLabel">/{flags}/</Text>
              <Menu title="模式" systemImage="slider.horizontal.3">
                <Button title={globalFlag ? "全局 g · 开" : "全局 g · 关"} action={() => setGlobalFlag(!globalFlag)} />
                <Button title={ignoreCase ? "忽略大小写 i · 开" : "忽略大小写 i · 关"} action={() => setIgnoreCase(!ignoreCase)} />
                <Button title={multiline ? "多行 m · 开" : "多行 m · 关"} action={() => setMultiline(!multiline)} />
              </Menu>
            </HStack>
            <TextField
              title=""
              value={pattern}
              prompt="例如 \\d+、[A-Z]+ 或 ^hello"
              onChanged={setPattern}
              frame={{ height: 42, maxWidth: "infinity", alignment: "leading" }}
              textFieldStyle="roundedBorder"
              autocorrectionDisabled
            />
            {result.error ? <Text font="caption2" foregroundStyle="systemRed">{result.error}</Text> : <Text font="caption2" foregroundStyle="systemTeal">输入即测试，无需额外操作</Text>}
          </VStack>

            <VStack
              spacing={8}
              padding={12}
              frame={{ maxWidth: "infinity", alignment: "topLeading" }}
              background="secondarySystemBackground"
              clipShape={{ type: "rect", cornerRadius: 14 }}
            >
              <HStack frame={{ maxWidth: "infinity" }}>
                <Text font="caption" foregroundStyle="systemPurple" fontWeight="semibold">正则帮助</Text>
                <Text font="caption2" foregroundStyle="secondaryLabel">长按示例复制正则</Text>
              </HStack>
              {helpExamples.length ? helpExamples.map((example, index) => (
                <VStack
                  key={`${example.title}-${index}`}
                  alignment="leading"
                  spacing={4}
                  padding={{ top: 8, bottom: 8, leading: 10, trailing: 10 }}
                  frame={{ maxWidth: "infinity", alignment: "topLeading" }}
                  background="tertiarySystemBackground"
                  clipShape={{ type: "rect", cornerRadius: 10 }}
                  onLongPressGesture={{
                    minDuration: 500,
                    perform: () => copyText(example.pattern),
                  }}
                >
                  <Text font="caption" fontWeight="semibold" foregroundStyle="label">{example.title}</Text>
                  <Text font="caption2" foregroundStyle="secondaryLabel">{example.description}</Text>
                  <Text font="caption2" monospaced foregroundStyle="systemOrange">/{example.pattern}/</Text>
                  <Text font="caption2" monospaced styledText={{ content: styledHelpText(example) }} />
                </VStack>
              )) : <Text font="caption2" foregroundStyle="systemRed">{help.error}</Text>}
              {helpExamples.length && help.error ? <Text font="caption2" foregroundStyle="systemOrange">{help.error}，其余示例仍已显示</Text> : null}
            </VStack>

            {result.groupCount > 0 ? (
              <VStack spacing={6} padding={10} background={{ style: "tertiarySystemBackground", shape: { type: "rect", cornerRadius: 14 } }}>
              <HStack frame={{ maxWidth: "infinity" }}>
                <Text font="caption" foregroundStyle="systemPurple" fontWeight="semibold">捕获组 · {result.groupCount}</Text>
                <Button title={groupsExpanded ? "收起" : "展开"} action={() => setGroupsExpanded(!groupsExpanded)} buttonStyle="borderless" />
              </HStack>
              {groupsExpanded ? <VStack spacing={4}>
                {allCaptures.length ? allCaptures.map((capture, index) => <Button key={`${capture.matchIndex}-${index}`} title={`匹配 ${capture.matchIndex + 1} · ${capture.name}: ${capture.value}`} action={() => copyText(capture.value === "未匹配" ? "" : capture.value)} buttonStyle="plain" />) : <Text font="caption2" foregroundStyle="secondaryLabel">暂无捕获组结果</Text>}
              </VStack> : null}
            </VStack>
          ) : null}
        </VStack>
      </ScrollView>
    </NavigationStack>
  )
}
