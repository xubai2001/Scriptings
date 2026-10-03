/**
 * 添加订阅：RSS URL 或普通网站地址（自动发现 feed）。
 * 也承担 OPML 导入的入口展示。
 */

import {
  Button,
  Group,
  HStack,
  Image,
  List,
  NavigationStack,
  Picker,
  ProgressView,
  Section,
  Spacer,
  Text,
  TextField,
  VStack,
  useState,
} from "scripting"
import { Navigation } from "scripting"
import type { Feed, Folder } from "../models"
import { discoverFeeds, faviconURL, type DiscoveredFeed } from "../lib/discovery"
import { fetchAndParseFeed, refreshFeed } from "../lib/refresh"
import { store, useStoreVersion } from "../lib/store"
import { uid } from "../lib/utils"
import { usePalette } from "../theme"

export function AddFeedPage({ presented = true }: { presented?: boolean }) {
  useStoreVersion()
  const palette = usePalette()
  const dismiss = Navigation.useDismiss()
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [candidates, setCandidates] = useState<DiscoveredFeed[]>([])
  const [picked, setPicked] = useState("")
  const [folderID, setFolderID] = useState("__none__")
  const [status, setStatus] = useState("")

  const reset = () => {
    setCandidates([])
    setPicked("")
    setError("")
    setStatus("")
  }

  const addFeed = async (target: DiscoveredFeed, folder: string | undefined) => {
    setStatus("正在读取订阅源…")
    const parsed = await fetchAndParseFeed(target.url)
    const feed: Feed = {
      id: uid("feed-"),
      title: parsed.meta.title || target.title || target.url,
      url: target.url,
      siteURL: parsed.meta.siteURL || "",
      description: parsed.meta.description || "",
      iconURL: parsed.meta.iconURL || (parsed.meta.siteURL ? faviconURL(parsed.meta.siteURL) : undefined),
      folderID: folder,
      unreadCount: 0,
      isMuted: false,
      sortOrder: store.feeds.length,
      feedType: parsed.meta.feedType,
    }
    const saved = store.addFeedData(feed)
    await store.saveFeedArticles(saved.id, [])
    await refreshFeed(saved.id, { limit: 60 })
    return saved
  }

  const start = async () => {
    reset()
    const value = url.trim()
    if (!value) {
      setError("请输入 RSS 地址或网站地址")
      return
    }
    setBusy(true)
    try {
      const result = await discoverFeeds(value)
      if (result.feeds.length === 1) {
        await addFeed(result.feeds[0], folderID === "__none__" ? undefined : folderID)
        setStatus("已添加")
        setBusy(false)
        dismiss(true)
        return
      }
      setStatus("")
      setCandidates(result.feeds)
      setPicked(result.feeds[0].url)
    } catch (err) {
      setError(String((err as Error)?.message ?? "无法读取这个地址"))
    } finally {
      setBusy(false)
    }
  }

  const confirmCandidate = async () => {
    const target = candidates.find((c) => c.url === picked)
    if (!target) return
    setBusy(true)
    setError("")
    try {
      await addFeed(target, folderID === "__none__" ? undefined : folderID)
      setBusy(false)
      dismiss(true)
    } catch (err) {
      setBusy(false)
      setError(String((err as Error)?.message ?? "添加失败"))
    }
  }

  const list = (
    <List
      navigationTitle="添加订阅"
      navigationBarTitleDisplayMode="inline"
      listStyle="insetGroup"
      toolbar={
        presented
          ? {
              topBarTrailing: <Button title="取消" action={() => dismiss(false)} />,
            }
          : undefined
      }
    >
      <Section header={<Text>RSS 地址</Text>} footer={<Text font={12}>支持 RSS、Atom、JSON Feed 与 OPML 导出的地址。</Text>}>
        <TextField
          title="RSS URL"
          value={url}
          onChanged={(value: string) => setUrl(value)}
          prompt="https://example.com/feed"
          keyboardType="URL"
          autocorrectionDisabled
          textInputAutocapitalization="never"
          onSubmit={() => void start()}
        />
        <TextField
          title="或者输入网站地址"
          value={url}
          onChanged={(value: string) => setUrl(value)}
          prompt="https://example.com"
          keyboardType="URL"
          autocorrectionDisabled
          textInputAutocapitalization="never"
        />
        <Picker
          value={folderID}
          onChanged={(value: string) => setFolderID(value)}
          pickerStyle="inline"
          label={<Text>分类</Text>}
        >
          <Text tag="__none__">未分类</Text>
          {store.folders.map((folder) => (
            <Text key={folder.id} tag={folder.id}>
              {folder.name}
            </Text>
          ))}
        </Picker>
        <Button title={busy ? "正在查找…" : "添加"} action={() => void start()} disabled={busy || !url.trim()} />
      </Section>

      {busy ? (
        <Section>
          <HStack spacing={10}>
            <ProgressView progressViewStyle="circular" />
            <Text font={14} foregroundStyle={palette.secondary}>
              {status || "正在查找订阅源…"}
            </Text>
          </HStack>
        </Section>
      ) : null}

      {error ? (
        <Section>
          <VStack alignment="leading" spacing={4}>
            <Text font={15} fontWeight="medium" foregroundStyle={palette.label}>
              无法添加
            </Text>
            <Text font={13} foregroundStyle={palette.secondary}>
              {error}
            </Text>
          </VStack>
        </Section>
      ) : null}

      {candidates.length ? (
        <Section header={<Text>发现 {candidates.length} 个订阅源</Text>}>
          {candidates.map((candidate) => (
            <Button
              key={candidate.url}
              action={() => setPicked(candidate.url)}
              buttonStyle="plain"
              frame={{ maxWidth: "infinity" }}
            >
              <HStack spacing={10} frame={{ maxWidth: "infinity" }}>
                <Image
                  systemName={picked === candidate.url ? "largecircle.fill.circle" : "circle"}
                  font={15}
                  foregroundStyle={picked === candidate.url ? palette.accent : palette.tertiary}
                />
                <VStack alignment="leading" spacing={2}>
                  <Text font={15} fontWeight="medium" foregroundStyle={palette.label}>
                    {candidate.type === "atom" ? "Atom" : candidate.type === "json" ? "JSON Feed" : "RSS"}
                  </Text>
                  <Text font={12} foregroundStyle={palette.secondary} lineLimit={1}>
                    {candidate.url}
                  </Text>
                </VStack>
                <Spacer />
              </HStack>
            </Button>
          ))}
          <Button title="添加选中的订阅源" action={() => void confirmCandidate()} disabled={busy} />
        </Section>
      ) : null}
    </List>
  )

  return presented ? <NavigationStack>{list}</NavigationStack> : list
}
