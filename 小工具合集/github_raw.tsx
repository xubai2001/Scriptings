import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  Section,
  Text,
  TextField,
  VStack,
  useState,
} from "scripting"

function normalizeGitHubURL(value: string): string | null {
  let raw = value.trim()
  if (!raw) return null
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`

  try {
    const url = new URL(raw)
    if (url.hostname.toLowerCase() !== "github.com") return null
    const parts = url.pathname.split("/").filter(Boolean)
    if (parts.length < 2) return null

    const owner = parts[0]
    const repo = parts[1].replace(/\.git$/i, "")
    let branch = "main"
    let filePath = ""
    const blobIndex = parts.indexOf("blob")
    const treeIndex = parts.indexOf("tree")
    const markerIndex = blobIndex >= 0 ? blobIndex : treeIndex
    if (markerIndex >= 0) {
      branch = parts[markerIndex + 1] || branch
      filePath = parts.slice(markerIndex + 2).join("/")
    } else if (parts.length > 2) {
      filePath = parts.slice(2).join("/")
    }

    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}${filePath ? `/${filePath}` : ""}`
  } catch {
    return null
  }
}

export function GitHubRawView() {
  const dismiss = Navigation.useDismiss()
  const [input, setInput] = useState("")
  const [result, setResult] = useState("")
  const [error, setError] = useState("")

  function convert() {
    const converted = normalizeGitHubURL(input)
    if (!converted) {
      setResult("")
      setError("请输入有效的 GitHub 仓库、文件或目录链接")
      return
    }
    setError("")
    setResult(converted)
  }

  async function copyResult() {
    if (!result) return
    await Pasteboard.setString(result)
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="GitHub 转 Raw"
        navigationBarTitleDisplayMode="inline"
        toolbar={{ cancellationAction: <Button title="完成" action={dismiss} /> }}
        listStyle="insetGroup"
      >
        <Section header={<Text>GitHub 地址</Text>} footer={<Text>支持仓库首页、blob 文件链接和 tree 目录链接。目录链接会生成该目录的 Raw 路径前缀。</Text>}>
          <TextField
            title="链接"
            value={input}
            onChanged={setInput}
            prompt="https://github.com/user/repo/..."
            axis="vertical"
          />
          <Button title="生成 Raw 连接" systemImage="wand.and.stars" action={convert} />
          {error ? <Text foregroundStyle="red">{error}</Text> : null}
        </Section>
        {result ? (
          <Section header={<Text>Raw 连接</Text>}>
            <VStack spacing={12} padding={{ top: 6, bottom: 6 }}>
              <Text foregroundStyle="secondaryLabel">{result}</Text>
              <HStack spacing={10}>
                <Button title="复制连接" systemImage="doc.on.doc" action={copyResult} />
                <Image systemName="checkmark.circle.fill" foregroundStyle="green" />
              </HStack>
            </VStack>
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  )
}
