/**
 * 订阅页：按文件夹分组的订阅列表 + 订阅源详情。
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
  Picker,
  Section,
  Spacer,
  Text,
  Toggle,
  VStack,
  useState,
} from "scripting"
import { refreshAllFeeds, refreshFeed } from "../lib/refresh"
import { store, useStoreVersion } from "../lib/store"
import { relativeTime, uid } from "../lib/utils"
import { fontProps } from "../lib/typography"
import { usePalette } from "../theme"
import { EmptyState, ExitButton, FeedIcon, UnreadDot } from "./components"
import { ArticlePage } from "./article"

function folderOptions(): Array<{ id: string; name: string }> {
  return store.folders.map((folder) => ({ id: folder.id, name: folder.name }))
}

// ── 订阅列表 ─────────────────────────────────────────────────

export function SubscriptionsPage({ onAddFeed, onExit }: { onAddFeed: () => void; onExit: () => void }) {
  useStoreVersion()
  const palette = usePalette()

  const loose = store.feeds.filter((feed) => !feed.folderID)

  const newFolder = async () => {
    const name = await Dialog.prompt({ title: "新建文件夹", placeholder: "例如：科技", confirmLabel: "创建" })
    if (name && name.trim()) store.addFolder(name.trim())
  }

  const feedRow = (feedID: string) => {
    const feed = store.feeds.find((f) => f.id === feedID)
    if (!feed) return null
    const unread = store.unreadCount(feed.id)
    return (
      <NavigationLink key={feed.id} destination={<FeedDetailPage feedID={feed.id} />}>
        <HStack spacing={11}>
          <FeedIcon title={feed.title} iconURL={feed.iconURL} size={30} />
          <VStack alignment="leading" spacing={2}>
            <Text font={16} foregroundStyle={palette.label} lineLimit={1}>
              {feed.title}
            </Text>
            {feed.lastError ? (
              <Text font={12} foregroundStyle="systemOrange" lineLimit={1}>
                无法更新
              </Text>
            ) : null}
          </VStack>
          <Spacer />
          {feed.isMuted ? (
            <Image systemName="bell.slash" font={13} foregroundStyle={palette.tertiary} />
          ) : null}
          {unread > 0 ? (
            <HStack spacing={6}>
              <UnreadDot visible />
              <Text font={14} foregroundStyle={palette.secondary}>
                {unread}
              </Text>
            </HStack>
          ) : null}
        </HStack>
      </NavigationLink>
    )
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="订阅"
        navigationBarTitleDisplayMode="large"
        toolbar={{
          topBarLeading: [<ExitButton key="exit" onExit={onExit} />],
          topBarTrailing: [
            <Button key="add" action={onAddFeed} buttonStyle="plain">
              <Image systemName="plus" font={16} />
            </Button>,
            <Menu key="more" label={<Image systemName="ellipsis.circle" font={16} />}>
              <Button title="新建文件夹" systemImage="folder.badge.plus" action={() => void newFolder()} />
              <Button title="刷新全部订阅" systemImage="arrow.clockwise" action={() => void refreshAllFeedsQuiet()} />
            </Menu>,
          ],
        }}
      >
        {store.feeds.length === 0 ? (
          <Section>
            <EmptyState
              systemImage="square.stack"
              title="还没有订阅"
              message="添加几个 RSS 订阅，或者从 OPML 导入。"
              actionTitle="添加订阅"
              action={onAddFeed}
            />
          </Section>
        ) : null}

        {store.folders.map((folder) => {
          const feeds = store.feeds.filter((feed) => feed.folderID === folder.id)
          if (!feeds.length) return null
          return (
            <Section key={folder.id} title={folder.name}>
              {feeds.map((feed) => feedRow(feed.id))}
            </Section>
          )
        })}

        {loose.length ? (
          <Section title={store.folders.length ? "未分类" : "全部订阅"}>
            {loose.map((feed) => feedRow(feed.id))}
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  )
}

async function refreshAllFeedsQuiet() {
  await refreshAllFeeds()
}

// ── 订阅源详情 ───────────────────────────────────────────────

export function FeedDetailPage({ feedID }: { feedID: string }) {
  useStoreVersion()
  const palette = usePalette()
  const [refreshing, setRefreshing] = useState(false)
  const feed = store.feeds.find((f) => f.id === feedID)

  if (!feed) {
    return (
      <List navigationTitle="订阅">
        <Text foregroundStyle={palette.secondary}>这个订阅源已被删除。</Text>
      </List>
    )
  }

  const unread = store.unreadCount(feed.id)
  const articles = store.sortedArticles().filter((a) => a.feedID === feed.id)

  const rename = async () => {
    const name = await Dialog.prompt({ title: "重命名订阅", defaultValue: feed.title, confirmLabel: "保存" })
    if (name === null) return
    if (name.trim()) store.updateFeed(feed.id, { title: name.trim() })
  }

  const changeURL = async () => {
    const url = await Dialog.prompt({ title: "订阅地址", defaultValue: feed.url, confirmLabel: "保存" })
    if (url === null) return
    if (url.trim()) store.updateFeed(feed.id, { url: url.trim() })
  }

  const unsubscribe = async () => {
    const ok = await Dialog.confirm({
      title: "取消订阅",
      message: `确定要取消订阅「${feed.title}」吗？本地已缓存的文章也会一起删除。`,
      confirmLabel: "取消订阅",
    })
    if (ok) await store.removeFeed(feed.id)
  }

  const doRefresh = async () => {
    setRefreshing(true)
    await refreshFeed(feed.id)
    setRefreshing(false)
  }

  return (
    <List navigationTitle={feed.title} navigationBarTitleDisplayMode="inline" listStyle="insetGroup">
      <Section>
        <HStack spacing={12}>
          <FeedIcon title={feed.title} iconURL={feed.iconURL} size={48} />
          <VStack alignment="leading" spacing={3}>
            <Text font={17} fontWeight="semibold" foregroundStyle={palette.label}>
              {feed.title}
            </Text>
            <Text font={13} foregroundStyle={palette.secondary} lineLimit={2}>
              {feed.description || feed.siteURL}
            </Text>
          </VStack>
        </HStack>
      </Section>

      {feed.lastError ? (
        <Section>
          <VStack alignment="leading" spacing={6} padding={{ vertical: 4 }}>
            <Text font={15} fontWeight="medium" foregroundStyle="systemOrange">
              无法更新
            </Text>
            <Text font={13} foregroundStyle={palette.secondary}>
              最后成功更新：{feed.lastSuccessAt ? relativeTime(feed.lastSuccessAt) : "从未"}
            </Text>
            <Text font={13} foregroundStyle={palette.tertiary}>
              {feed.lastError}
            </Text>
            <Button title="重试" buttonStyle="bordered" action={() => void doRefresh()} disabled={refreshing} />
          </VStack>
        </Section>
      ) : null}

      <Section title="订阅信息">
        <Button action={() => void Pasteboard.setString(feed.url)} buttonStyle="plain" frame={{ maxWidth: "infinity" }}>
          <HStack frame={{ maxWidth: "infinity" }}>
            <Text font={16} foregroundStyle={palette.label}>
              订阅地址
            </Text>
            <Spacer />
            <Text font={13} foregroundStyle={palette.secondary} lineLimit={1}>
              {feed.url}
            </Text>
          </HStack>
        </Button>
        <HStack>
          <Text font={16}>未读</Text>
          <Spacer />
          <Text font={15} foregroundStyle={palette.secondary}>
            {unread}
          </Text>
        </HStack>
        <HStack>
          <Text font={16}>更新频率</Text>
          <Spacer />
          <Text font={14} foregroundStyle={palette.secondary}>
            {feed.lastUpdated ? `上次 ${relativeTime(feed.lastUpdated)}` : "自动"}
          </Text>
        </HStack>
        <Button title={refreshing ? "正在刷新…" : "立即刷新"} action={() => void doRefresh()} disabled={refreshing} />
      </Section>

      <Section title="管理">
        <Button title="重命名" action={() => void rename()} />
        <Button title="修改订阅地址" action={() => void changeURL()} />
        <Picker
          value={feed.folderID ?? "__none__"}
          onChanged={(value: string) => store.moveFeedToFolder(feed.id, value === "__none__" ? undefined : value)}
          pickerStyle="inline"
          label={<Text>分类</Text>}
        >
          <Text tag="__none__">未分类</Text>
          {folderOptions().map((folder) => (
            <Text key={folder.id} tag={folder.id}>
              {folder.name}
            </Text>
          ))}
        </Picker>
        <Button
          title="新建文件夹…"
          action={() => {
            void (async () => {
              const name = await Dialog.prompt({ title: "新建文件夹", placeholder: "例如：科技", confirmLabel: "创建" })
              if (!name || !name.trim()) return
              const folder = store.addFolder(name.trim())
              store.moveFeedToFolder(feed.id, folder.id)
            })()
          }}
        />
        <Toggle
          title="静音（不参与自动刷新）"
          value={feed.isMuted}
          onChanged={(value: boolean) => store.updateFeed(feed.id, { isMuted: value })}
        />
        <Button title="标记全部已读" action={() => store.markAllRead(feed.id)} disabled={unread === 0} />
        <Button title="取消订阅" role="destructive" action={() => void unsubscribe()} />
      </Section>

      {articles.length ? (
        <Section title="最近文章">
          {articles.slice(0, 8).map((article) => (
            <NavigationLink key={article.id} destination={<ArticlePage articleID={article.id} />}>
              <VStack alignment="leading" spacing={3}>
                <Text {...fontProps(store.settings.titleFont, 15)} foregroundStyle={palette.label} lineLimit={2}>
                  {article.title}
                </Text>
                <Text font={12} foregroundStyle={palette.tertiary}>
                  {relativeTime(article.publishedAt)}
                </Text>
              </VStack>
            </NavigationLink>
          ))}
        </Section>
      ) : null}
    </List>
  )
}
