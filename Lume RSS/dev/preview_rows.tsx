/**
 * 列表行封面图布局检查：正常比例 / 超宽 / 超高三种封面各一行。
 * 目的是验证「封面图过宽会把整行文字一起顶宽」这类问题。
 * 运行：scripting-ts preview_ui "<项目>/dev/preview_rows.tsx" --screenshot
 */

import "./isolate"
import { List, NavigationStack, Section } from "scripting"
import type { Article } from "../models"
import { store } from "../lib/store"
import { uid } from "../lib/utils"
import { ArticleRow } from "../ui/components"

const COVERS: Array<{ label: string; url: string; note: string }> = [
  { label: "正常封面 1200×800", url: "https://picsum.photos/seed/lumenormal/1200/800", note: "对照组" },
  { label: "超宽封面 3000×400", url: "https://picsum.photos/seed/lumewide/3000/400", note: "关键用例" },
  { label: "超高封面 400×2400", url: "https://picsum.photos/seed/lumetall/400/2400", note: "反向用例" },
]

function makeArticle(index: number, cover: string): Article {
  return {
    id: `a-rows-${index}`,
    feedID: "feed-rows",
    dedupeKey: `rows-${index}`,
    title: `${COVERS[index].label}：这张封面图不应当把整行文字顶宽，标题应当在屏幕宽度内正常换行`,
    author: "Jane Doe",
    url: "https://example.com/post",
    publishedAt: Date.now() - index * 3600_000,
    updatedAt: Date.now() - index * 3600_000,
    summary:
      "摘要文字用来占位并检查换行宽度：如果这一段的右边界超出了屏幕，就说明封面图把布局撑宽了。".repeat(2),
    blocks: [],
    htmlContent: "",
    images: [{ id: uid("m-"), type: "image", url: cover, source: "content" }],
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

store.loaded = true

export default function View() {
  return (
    <NavigationStack>
      <List listStyle="insetGroup" navigationTitle="封面图布局" listRowInsets={{ top: 0, leading: 20, bottom: 0, trailing: 20 }}>
        <Section>
          {COVERS.map((cover, index) => (
            <ArticleRow key={cover.label} article={makeArticle(index, cover.url)} feedTitle={cover.note} />
          ))}
        </Section>
      </List>
    </NavigationStack>
  )
}
