/**
 * 探针：NavigationLink 行里封面图的宽度到底被提案成多少 —— 用于给封面找一个「硬约束」。
 * 每行结构 = NavigationLink(label: [宽度探针文本 + ArticleRow + 绿色细尺])，行外再画一条尺做对照。
 * 绿色细尺是「理想宽度 0」的 Rectangle，渲染出来就是它所在容器的真实宽度。
 * 运行：scripting-ts preview_ui "<项目>/dev/preview_rows2.tsx" --screenshot
 */

import "./isolate"
import { GeometryReader, List, NavigationLink, NavigationStack, Rectangle, Text, VStack } from "scripting"
import type { Article } from "../models"
import { store } from "../lib/store"
import { uid } from "../lib/utils"
import { ArticleRow } from "../ui/components"

const COVERS: Array<{ label: string; url: string | null }> = [
  { label: "纯文字", url: null },
  { label: "超宽 3000×400", url: "https://picsum.photos/seed/lumewide/3000/400" },
  { label: "极宽 6000×200", url: "https://picsum.photos/seed/lumeultrawide/6000/200" },
]

function makeArticle(index: number, cover: string | null): Article {
  return {
    id: `a-rows-${index}`,
    feedID: "feed-rows",
    dedupeKey: `rows-${index}`,
    title: `${COVERS[index].label}：这张封面图不应当把整行文字顶宽，标题应当在屏幕宽度内正常换行`,
    author: "Jane Doe",
    url: "https://example.com/post",
    publishedAt: Date.now() - index * 3600_000,
    updatedAt: Date.now() - index * 3600_000,
    summary: "摘要文字用来占位并检查换行宽度：如果这一段的右边界超出了屏幕，就说明封面图把布局撑宽了。".repeat(2),
    blocks: [],
    htmlContent: "",
    images: cover ? [{ id: uid("m-"), type: "image", url: cover, source: "content" }] : [],
    categories: [],
    state: "unread",
    isFavorite: false,
    isLater: false,
    progress: { percent: 0, updatedAt: 0 },
    createdAt: Date.now(),
    contentSource: "feed-full",
    contentFetched: true,
    readingMinutes: 3,
  }
}

/** 报告自己被提案到的宽度 */
function WidthEcho({ label }: { label: string }) {
  return (
    <GeometryReader>
      {(proxy) => {
        console.log("[probe]", label, "proposal =", proxy.size.width)
        return (
          <Text font={10} foregroundStyle="systemOrange">
            {label} 提案 {Math.round(proxy.size.width)}pt
          </Text>
        )
      }}
    </GeometryReader>
  )
}

/** 绿色细尺：渲染宽度 = 所在容器真实宽度 */
function Ruler({ label }: { label: string }) {
  return (
    <VStack spacing={1} padding={{ vertical: 1 }} frame={{ maxWidth: "infinity" }}>
      <Text font={10} foregroundStyle="systemGreen">
        {label}
      </Text>
      <Rectangle fill="systemGreen" frame={{ maxWidth: "infinity", height: 3 }} />
    </VStack>
  )
}

store.loaded = true

export default function View() {
  return (
    <NavigationStack>
      <VStack spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        <List
          navigationTitle="宽度提案"
          navigationBarTitleDisplayMode="inline"
          listRowSeparator="hidden"
          listRowInsets={{ top: 0, leading: 20, bottom: 0, trailing: 20 }}
        >
          <Ruler label="尺 A：行外（List 行内容区）" />
          {COVERS.map((cover, index) => (
            <VStack key={cover.label} spacing={0} frame={{ maxWidth: "infinity" }}>
              <NavigationLink destination={<Text>{cover.label}</Text>}>
                <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity" }}>
                  <WidthEcho label={`${cover.label} 标签内`} />
                  <ArticleRow article={makeArticle(index, cover.url)} feedTitle={cover.label} />
                  <Ruler label={`尺 ${index + 1}：NavigationLink 标签内`} />
                </VStack>
              </NavigationLink>
              <Ruler label={`尺 ${index + 1}b：行外`} />
            </VStack>
          ))}
        </List>
      </VStack>
    </NavigationStack>
  )
}
