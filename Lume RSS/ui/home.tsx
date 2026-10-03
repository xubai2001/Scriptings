/**
 * 首页：问候语 + 筛选条 + 文章列表。
 * 列表是唯一的贪婪视图，所有头部都是非贪婪的紧凑视图。
 */

import {
  Button,
  Group,
  HStack,
  Image,
  List,
  Menu,
  NavigationLink,
  NavigationStack,
  ScrollView,
  Spacer,
  Text,
  VStack,
  useState,
} from "scripting"
import type { FeedRefreshStatus } from "../models"
import { heroImage } from "../lib/media"
import { refreshAllFeeds } from "../lib/refresh"
import { store, useStoreVersion } from "../lib/store"
import { greeting } from "../lib/utils"
import { usePalette } from "../theme"
import { ArticleRow, EmptyState, ExitButton, FilterBar, ListSkeleton } from "./components"
import { ArticlePage } from "./article"

type HomeFilter = "all" | "unread" | "favorite" | "images" | "ai"

const FILTERS: Array<{ value: HomeFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "unread", label: "未读" },
  { value: "favorite", label: "收藏" },
  { value: "images", label: "图片" },
  { value: "ai", label: "AI" },
]

function titleFor(filter: HomeFilter): string {
  switch (filter) {
    case "unread":
      return "未读"
    case "favorite":
      return "收藏"
    case "images":
      return "图片"
    case "ai":
      return "AI 摘要"
    default:
      return "全部文章"
  }
}

function RefreshPanel({ statuses }: { statuses: FeedRefreshStatus[] }) {
  const palette = usePalette()
  const visible = statuses.slice(0, 4)
  const resting = statuses.length - visible.length
  return (
    <VStack alignment="leading" spacing={4} padding={{ horizontal: 20, vertical: 8 }} frame={{ maxWidth: "infinity" }}>
      <Text font={12} fontWeight="medium" foregroundStyle={palette.tertiary}>
        正在更新
      </Text>
      {visible.map((status) => (
        <HStack key={status.feedID} spacing={6} frame={{ maxWidth: "infinity" }}>
          <Text font={12} foregroundStyle={palette.secondary} lineLimit={1}>
            {status.title || "订阅源"}
          </Text>
          <Spacer />
          {status.state === "done" ? (
            <Text font={12} foregroundStyle="systemGreen">
              ✓ {status.newCount > 0 ? `+${status.newCount}` : ""}
            </Text>
          ) : status.state === "failed" ? (
            <Text font={12} foregroundStyle="systemOrange">
              无法更新
            </Text>
          ) : (
            <Text font={12} foregroundStyle={palette.tertiary}>
              更新中…
            </Text>
          )}
        </HStack>
      ))}
      {resting > 0 ? (
        <Text font={12} foregroundStyle={palette.tertiary}>
          还有 {resting} 个订阅源…
        </Text>
      ) : null}
    </VStack>
  )
}

export function HomePage({ onAddFeed, onExit }: { onAddFeed: () => void; onExit: () => void }) {
  useStoreVersion()
  const palette = usePalette()
  const [filter, setFilter] = useState<HomeFilter>("all")
  const [query, setQuery] = useState("")

  const searching = query.trim().length > 0

  const baseList = (() => {
    const all = store.sortedArticles()
    switch (filter) {
      case "unread":
        return all.filter((a) => a.state !== "read")
      case "favorite":
        return store.favoriteArticles()
      case "images":
        return all.filter((a) => a.images.length > 0)
      case "ai":
        return all.filter((a) => !!a.aiSummary)
      default:
        return all
    }
  })()

  const articles = searching
    ? store.search(query, "all").slice(0, 80)
    : baseList

  const hasFeeds = store.feeds.length > 0

  const rows = articles.map((article) => {
    const feed = store.feedByID(article.feedID)
    const feedTitle = feed?.title ?? (article as { feedTitle?: string }).feedTitle ?? ""
    return (
      <NavigationLink
        key={article.id}
        destination={<ArticlePage articleID={article.id} />}
        leadingSwipeActions={{
          allowsFullSwipe: true,
          actions: [
            <Button
              key="lead-read"
              title={article.state === "read" ? "未读" : "已读"}
              systemImage={article.state === "read" ? "envelope.badge" : "checkmark.circle"}
              tint={palette.accent}
              action={() => store.setReadState(article.id, article.state === "read" ? "unread" : "read")}
            />,
          ],
        }}
        trailingSwipeActions={{
          allowsFullSwipe: false,
          actions: [
            <Button
              key="trail-fav"
              title="收藏"
              systemImage="star"
              tint="systemYellow"
              action={() => store.toggleFavorite(article.id)}
            />,
            <Button
              key="trail-read"
              title="已读"
              systemImage="checkmark.circle"
              tint={palette.accent}
              action={() => store.setReadState(article.id, article.state === "read" ? "unread" : "read")}
            />,
            <Button
              key="trail-later"
              title="稍后"
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
                title={article.state === "read" ? "标记为未读" : "标记为已读"}
                systemImage="checkmark.circle"
                action={() => store.setReadState(article.id, article.state === "read" ? "unread" : "read")}
              />
              <Button
                title={article.isLater ? "移出稍后阅读" : "稍后阅读"}
                systemImage="clock"
                action={() => store.toggleLater(article.id)}
              />
              <Button title="复制链接" systemImage="link" action={() => void Pasteboard.setString(article.url)} />
              <Button
                title="分享"
                systemImage="square.and.arrow.up"
                action={() => void ShareSheet.present([`${article.title}\n${feedTitle}\n${article.url}`])}
              />
              <Button title="在浏览器打开" systemImage="safari" action={() => void Safari.openURL(article.url)} />
            </Group>
          ),
        }}
      >
        <ArticleRow article={article} feedTitle={feedTitle} />
      </NavigationLink>
    )
  })

  const emptyState = (() => {
    if (searching) {
      return <EmptyState systemImage="magnifyingglass" title="没有找到相关文章" message={`没有匹配「${query.trim()}」的内容。`} />
    }
    if (!hasFeeds) {
      return (
        <EmptyState
          systemImage="newspaper"
          title="还没有文章"
          message="添加几个 RSS 订阅，这里就会开始出现内容。"
          actionTitle="添加订阅"
          action={onAddFeed}
        />
      )
    }
    if (filter === "favorite") {
      return (
        <EmptyState
          systemImage="star"
          title="还没有收藏"
          message="阅读过程中收藏重要文章，它们会出现在这里。"
        />
      )
    }
    if (filter === "ai") {
      return (
        <EmptyState
          systemImage="sparkles"
          title="还没有 AI 摘要"
          message="在文章里点击 AI，生成的摘要会出现在这里。"
        />
      )
    }
    if (filter === "images") {
      return <EmptyState systemImage="photo" title="还没有图片文章" message="包含图片的文章会出现在这里。" />
    }
    return <EmptyState systemImage="checkmark.circle" title="都读完了" message="所有文章都已读，去订阅页添加更多内容。" />
  })()

  return (
    <NavigationStack>
      <VStack
        spacing={0}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        background={palette.background}
        toolbar={{
          topBarLeading: [<ExitButton key="exit" onExit={onExit} />],
          topBarTrailing: [
            <Menu
              key="more"
              label={<Image systemName="ellipsis" font={16} foregroundStyle={palette.secondary} />}
            >
              <Button title="刷新全部订阅" systemImage="arrow.clockwise" action={() => void refreshAllFeeds()} />
              <Button title="全部标为已读" systemImage="checkmark.circle" action={() => store.markAllRead()} />
              <Button title="添加订阅" systemImage="plus" action={onAddFeed} />
            </Menu>,
          ],
        }}
      >
        {/* 头部：问候语 + 标题 */}
        <HStack padding={{ horizontal: 20, top: 4, bottom: 6 }} frame={{ maxWidth: "infinity" }}>
          <VStack alignment="leading" spacing={2}>
            <Text font={13} foregroundStyle={palette.tertiary}>
              {greeting()}
            </Text>
            <Text font={28} fontWeight="bold" foregroundStyle={palette.label}>
              {searching ? "搜索结果" : titleFor(filter)}
            </Text>
          </VStack>
          <Spacer />
        </HStack>

        {/* 筛选条：固定高度，避免横向 ScrollView 抢走竖直空间 */}
        {!searching ? (
          <VStack frame={{ maxWidth: "infinity", height: 46 }}>
            <FilterBar items={FILTERS} value={filter} onChanged={(value: HomeFilter) => setFilter(value)} />
          </VStack>
        ) : (
          <Text font={13} foregroundStyle={palette.tertiary} padding={{ horizontal: 20, vertical: 8 }}>
            {articles.length} 篇文章
          </Text>
        )}

        {store.refreshing ? <RefreshPanel statuses={store.refreshStatuses} /> : null}

        {!store.loaded ? (
          <ListSkeleton rows={4} />
        ) : (
          <List
            navigationTitle=""
            navigationBarTitleDisplayMode="inline"
            listRowSeparator="hidden"
            listRowInsets={{ top: 0, leading: 20, bottom: 0, trailing: 20 }}
            searchable={{
              value: query,
              onChanged: (value: string) => setQuery(value),
              prompt: "搜索文章",
              placement: "navigationBarDrawer",
            }
            }
            refreshable={async () => {
              await refreshAllFeeds({ concurrency: 3 })
            }}
          >
            {articles.length === 0 ? <Group key="empty">{emptyState}</Group> : rows}
          </List>
        )}
      </VStack>
    </NavigationStack>
  )
}
