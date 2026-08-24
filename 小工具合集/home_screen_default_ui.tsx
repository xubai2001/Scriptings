import {
  Color,
  HStack,
  Image,
  LazyVGrid,
  Navigation,
  NavigationStack,
  ScrollView,
  Spacer,
  Text,
  VStack,
  useState,
} from "scripting"

import { GitHubRawView } from "./github_raw"
import { ImageColorPickerView } from "./image_picker"
import { RegexEditorView } from "./regex_tester"

type Tool = {
  id: string
  title: string
  subtitle: string
  icon: string
  tint: Color
}

const TOOLS: Tool[] = [
  {
    id: "github-raw",
    title: "GitHub 转 Raw",
    subtitle: "仓库目录生成 Raw 连接",
    icon: "arrow.triangle.2.circlepath",
    tint: "rgba(41, 98, 255, 1)",
  },
  {
    id: "image-color-picker",
    title: "图片取色",
    subtitle: "裁剪图片并读取像素颜色",
    icon: "eyedropper.halffull",
    tint: "rgba(32, 170, 94, 1)",
  },
  {
    id: "regex-tester",
    title: "正则表达式实时测试器",
    subtitle: "实时匹配、高亮与替换预览",
    icon: "curlybraces.square",
    tint: "rgba(255, 149, 0, 1)",
  },
]

function destination(tool: Tool) {
  if (tool.id === "github-raw") return <GitHubRawView />
  if (tool.id === "image-color-picker") return <ImageColorPickerView />
  return <RegexEditorView standalone />
}

function ToolCard({ tool, columns, reorder }: {
  tool: Tool
  columns: number
  reorder: (draggedID: string) => void
}) {
  const preview = (
    <VStack frame={{ width: columns === 1 ? 260 : 150, height: columns === 1 ? 90 : 150 }} background={tool.tint} clipShape={{ type: "rect", cornerRadius: 24 }}>
      <Image systemName={tool.icon} font="largeTitle" foregroundStyle="white" />
      <Text font="headline" foregroundStyle="white">{tool.title}</Text>
    </VStack>
  )

  async function openTool() {
    await Navigation.present({ element: destination(tool) })
  }

  function performDrop(info: DropInfo) {
    const providers = info.itemProviders(["public.text"])
    if (!providers.length) return false
    void providers[0].loadText().then((id) => { if (id) reorder(id) })
    return true
  }

  return (
    <VStack
      alignment="leading"
      spacing={columns === 1 ? 8 : 12}
      padding={{ top: 16, bottom: 16, leading: 16, trailing: 16 }}
      frame={{ minHeight: columns === 1 ? 94 : 164, maxWidth: "infinity", alignment: "leading" as any }}
      background={tool.tint}
      clipShape={{ type: "rect", cornerRadius: 24 }}
      contentShape={{ type: "rect", cornerRadius: 24 }}
      onTapGesture={openTool}
      onDrag={{ data: () => ItemProvider.fromText(tool.id), preview }}
      onDrop={{
        types: ["public.text"],
        dropUpdated: () => "move",
        performDrop,
      }}
    >
      <HStack frame={{ maxWidth: "infinity" }}>
        <VStack frame={{ width: 42, height: 42 }} background="rgba(255,255,255,0.20)" clipShape={{ type: "rect", cornerRadius: 12 }}>
          <Image systemName={tool.icon} font="title2" foregroundStyle="white" />
        </VStack>
        <Spacer />
        <Image systemName="line.3.horizontal" font="caption" foregroundStyle="rgba(255,255,255,0.72)" />
      </HStack>
      <Spacer />
      <VStack alignment="leading" spacing={4}>
        <Text font="headline" fontWeight="bold" foregroundStyle="white">{tool.title}</Text>
        <Text font="caption" foregroundStyle="rgba(255,255,255,0.78)" lineLimit={columns === 1 ? 1 : 2}>{tool.subtitle}</Text>
      </VStack>
    </VStack>
  )
}

export default function HomeScreenView() {
  const [columns, setColumns] = useState(2)
  const [tools, setTools] = useState<Tool[]>(TOOLS)

  function moveTool(draggedID: string, targetID: string) {
    if (!draggedID || draggedID === targetID) return
    const fromIndex = tools.findIndex((tool) => tool.id === draggedID)
    const targetIndex = tools.findIndex((tool) => tool.id === targetID)
    if (fromIndex < 0 || targetIndex < 0) return
    const next = [...tools]
    const [moving] = next.splice(fromIndex, 1)
    const insertion = next.findIndex((tool) => tool.id === targetID)
    next.splice(insertion < 0 ? next.length : insertion, 0, moving)
    setTools(next)
  }

  return (
    <NavigationStack>
      <ScrollView navigationTitle="小工具" navigationBarTitleDisplayMode="large">
        <VStack alignment="leading" spacing={16} padding={{ top: 8, bottom: 28, leading: 16, trailing: 16 }}>
          <HStack frame={{ maxWidth: "infinity" }}>
            <Text font="subheadline" foregroundStyle="secondaryLabel">长按任意卡片，拖到另一张卡片上即可排序</Text>
            <Spacer />
            <Text font="caption" foregroundStyle="tertiaryLabel">{columns === 2 ? "双列" : "单列"}</Text>
          </HStack>
          <LazyVGrid
            columns={Array.from({ length: columns }, () => ({ size: { type: "flexible", min: 140, max: "infinity" } }))}
            spacing={14}
          >
            {tools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} columns={columns} reorder={(draggedID) => moveTool(draggedID, tool.id)} />
            ))}
          </LazyVGrid>
        </VStack>
      </ScrollView>
    </NavigationStack>
  )
}
