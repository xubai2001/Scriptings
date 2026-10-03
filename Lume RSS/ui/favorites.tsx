/**
 * 收藏页：收藏是独立快照（保留正文、图片 URL、AI 摘要、原始 URL），
 * 另外单独支持「稍后阅读」阅读队列。
 */

import {
  Button,
  Group,
  HStack,
  Image,
  List,
  NavigationLink,
  NavigationStack,
  Spacer,
  Text,
  VStack,
  useState,
} from "scripting"
import { store, useStoreVersion } from "../lib/store"
import { usePalette } from "../theme"
import { ArticleRow, EmptyState, ExitButton, FilterBar } from "./components"
import { ArticlePage } from "./article"

type SavedFilter = "all" | "article" | "images" | "ai"

const FILTERS: Array<{ value: SavedFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "article", label: "文章" },
  { value: "images", label: "图片" },
  { value: "ai", label: "AI 摘要" },
]

export function FavoritesPage({ onExit }: { onExit: () => void }) {
  useStoreVersion()
  const palette = usePalette()
  const [filter, setFilter] = useState<SavedFilter>("all")
  const [tab, setTab] = useState<"favorite" | "later">("favorite")

  const source = tab === "favorite" ? store.favoriteArticles() : store.laterArticles()
  const articles = (() => {
    switch (filter) {
      case "images":
        return source.filter((a) => a.images.length > 0)
      case "ai":
        return source.filter((a) => !!a.aiSummary)
      default:
        return source
    }
  })()

  const empty =
    tab === "later" ? (
      <EmptyState
        systemImage="clock"
        title="稍后阅读是空的"
        message="把想晚点读的文章加入队列，读完后会自动移出。"
      />
    ) : (
      <EmptyState
        systemImage="star"
        title="还没有收藏"
        message="阅读过程中收藏重要文章，它们会出现在这里。收藏会保存完整正文与图片，不受 RSS 更新影响。"
      />
    )

  return (
    <NavigationStack>
      <VStack
        spacing={0}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        background={palette.background}
        toolbar={{
          topBarLeading: [<ExitButton key="exit" onExit={onExit} />],
          topBarTrailing: [
            <Button
              key="switch"
              action={() => {
                setTab(tab === "favorite" ? "later" : "favorite")
                setFilter("all")
              }}
              buttonStyle="plain"
            >
              <Image systemName={tab === "favorite" ? "clock" : "star"} font={16} foregroundStyle={palette.secondary} />
            </Button>,
          ],
        }}
      >
        <HStack padding={{ horizontal: 20, top: 4, bottom: 8 }} frame={{ maxWidth: "infinity" }}>
          <VStack alignment="leading" spacing={2}>
            <Text font={13} foregroundStyle={palette.tertiary}>
              {tab === "favorite" ? `${store.favoriteArticles().length} 篇` : `${store.laterArticles().length} 篇`}
            </Text>
            <Text font={28} fontWeight="bold" foregroundStyle={palette.label}>
              {tab === "favorite" ? "收藏" : "稍后阅读"}
            </Text>
          </VStack>
          <Spacer />
        </HStack>

        <VStack frame={{ maxWidth: "infinity", height: 46 }}>
          <FilterBar items={FILTERS} value={filter} onChanged={(value: SavedFilter) => setFilter(value)} />
        </VStack>

        {articles.length === 0 ? (
          empty
        ) : (
          <List
            navigationTitle=""
            navigationBarTitleDisplayMode="inline"
            listRowSeparator="hidden"
            listRowInsets={{ top: 0, leading: 20, bottom: 0, trailing: 20 }}
          >
            {articles.map((article) => (
              <NavigationLink
                key={article.id}
                destination={<ArticlePage articleID={article.id} />}
                leadingSwipeActions={{
                  allowsFullSwipe: true,
                  actions: [
                    <Button
                      key="fav-read"
                      title="已读"
                      systemImage="checkmark.circle"
                      tint={palette.accent}
                      action={() => store.setReadState(article.id, "read")}
                    />,
                  ],
                }}
                trailingSwipeActions={{
                  allowsFullSwipe: false,
                  actions: [
                    <Button
                      key="fav-remove"
                      title="移除"
                      systemImage="trash"
                      role="destructive"
                      action={() => store.removeSaved(article.id)}
                    />,
                    <Button
                      key="fav-later"
                      title={article.isLater ? "移出稍后" : "稍后读"}
                      systemImage="clock"
                      tint="systemIndigo"
                      action={() => store.toggleLater(article.id)}
                    />,
                  ],
                }}
                contextMenu={{
                  menuItems: (
                    <Group>
                      <Button
                        title={article.isFavorite ? "取消收藏" : "收藏"}
                        systemImage="star"
                        action={() => store.toggleFavorite(article.id)}
                      />
                      <Button
                        title={article.isLater ? "移出稍后阅读" : "稍后阅读"}
                        systemImage="clock"
                        action={() => store.toggleLater(article.id)}
                      />
                      <Button
                        title="分享"
                        systemImage="square.and.arrow.up"
                        action={() => void ShareSheet.present([`${article.title}\n${article.url}`])}
                      />
                      <Button title="复制链接" systemImage="link" action={() => void Pasteboard.setString(article.url)} />
                    </Group>
                  ),
                }}
              >
                <ArticleRow article={article} feedTitle={article.feedTitle} />
              </NavigationLink>
            ))}
          </List>
        )}
      </VStack>
    </NavigationStack>
  )
}
