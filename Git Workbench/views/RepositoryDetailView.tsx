/**
 * 仓库详情 / 目录浏览（§7 / §8 / §10）
 *
 * 顶部：仓库信息 + 分支切换
 * 中部：当前目录的文件夹与文件
 * 底部：仓库操作入口（提交记录 / 分支 / Tags / Releases）
 *
 * 同一个组件递归用于子目录：传 path 与 ref。
 */

import {
  Button,
  Group,
  HStack,
  Image,
  List,
  Menu,
  Navigation,
  NavigationLink,
  NavigationStack,
  Section,
  Spacer,
  Text,
  VStack,
  useEffect,
  useObservable,
  useState,
} from "scripting"
import { Branch, FileEntry, RepositoryDetail } from "../types"
import { isStarred, setStarred } from "../api/repos"
import {
  loadBranches,
  loadDirectory,
  loadRepositoryDetail,
} from "../services/loaders"
import {
  getRecentSearches,
  isFavoriteRepo,
  pushRecent,
  pushRecentSearch,
  toggleFavoriteRepo,
} from "../services/store"
import { emitters } from "../utils/emitter"
import { useWatch } from "../utils/hooks"
import { ErrorInfo, toErrorInfo } from "../utils/errors"
import { fileIcon, fileTint } from "../utils/filetype"
import { fileSize, relativeTime } from "../utils/format"
import { BranchPickerSheet, BranchesListView } from "./BranchesView"
import { CommitDetailView, CommitsView } from "./CommitsView"
import { EmptyState, ErrorBanner, Hint, MetaRow } from "./components"
import { FilePreviewView } from "./FilePreviewView"
import { RefsView } from "./RefsView"
import { RepositoryRow } from "./RepositoryRow"

type Loaded<T> = { value: T | null; ts: number; fromCache: boolean; error: unknown | null }

export function RepositoryDetailView({
  owner,
  name,
  path = "",
  ref,
}: {
  owner: string
  name: string
  path?: string
  ref?: string
}) {
  const isRoot = path === ""
  const [detail, setDetail] = useState<Loaded<RepositoryDetail> | null>(null)
  const [currentRef, setCurrentRef] = useState<string | null>(ref || null)
  const [dir, setDir] = useState<Loaded<FileEntry[]> | null>(null)
  const [branches, setBranches] = useState<Branch[] | null>(null)
  const [starredState, setStarredState] = useState<boolean | null>(null)
  const [error, setError] = useState<ErrorInfo | null>(null)
  const fileQuery = useObservable("")
  const searchPresented = useObservable(false)
  useWatch(emitters.favorites, emitters.repositories)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const result = await loadRepositoryDetail(owner, name, false)
      if (cancelled) return
      setDetail(result)
      if (result.error && !result.value) setError(toErrorInfo(result.error, "加载仓库失败"))
      if (!currentRef) setCurrentRef(result.value?.defaultBranch || "main")
      if (isRoot) {
        try {
          const starred = await isStarred(owner, name)
          if (!cancelled) setStarredState(starred)
        } catch {
          // star 状态读取失败不影响其它功能
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [owner, name])

  useEffect(() => {
    if (!currentRef) return
    let cancelled = false
    ;(async () => {
      const result = await loadDirectory(owner, name, currentRef, path, false)
      if (cancelled) return
      setDir(result)
      if (result.error && !result.value) setError(toErrorInfo(result.error, "加载目录失败"))
    })()
    return () => {
      cancelled = true
    }
  }, [currentRef, path])

  // 搜索框关闭时记录关键词，供「最近搜索」使用
  useEffect(() => {
    if (!searchPresented.value && (fileQuery.value || "").trim()) {
      pushRecentSearch(fileQuery.value)
    }
  }, [searchPresented.value])

  async function refreshAll() {
    setError(null)
    const detailResult = await loadRepositoryDetail(owner, name, true)
    setDetail(detailResult)
    if (currentRef) {
      const dirResult = await loadDirectory(owner, name, currentRef, path, true)
      setDir(dirResult)
    }
    const branchResult = await loadBranches(owner, name, true)
    setBranches(branchResult.value)
  }

  async function pickBranch() {
    const detailBranch = detail?.value?.defaultBranch || "main"
    let list = branches
    if (!list) {
      const result = await loadBranches(owner, name, false)
      list = result.value || []
      setBranches(list)
    }
    const picked = await Navigation.present<string | null>(
      <BranchPickerSheet
        owner={owner}
        repo={name}
        branches={list}
        current={currentRef || detailBranch}
        defaultBranch={detailBranch}
      />
    )
    if (picked && picked !== currentRef) {
      setCurrentRef(picked)
      const result = await loadDirectory(owner, name, picked, path, true)
      setDir(result)
    }
  }

  async function toggleStar() {
    const next = !(starredState || false)
    setStarredState(next)
    try {
      await setStarred(owner, name, next)
    } catch (e) {
      setStarredState(!next)
      setError(toErrorInfo(e, "Star 操作失败"))
    }
  }

  const keyword = (fileQuery.value || "").trim().toLowerCase()
  const entries = dir?.value || []
  const filtered = keyword
    ? entries.filter(entry => entry.name.toLowerCase().indexOf(keyword) !== -1)
    : entries
  const favorite = isFavoriteRepo(`${owner}/${name}`)

  const header = (
    <Section
      header={
        isRoot ? (
          <VStack alignment="leading" spacing={4}>
            <HStack spacing={6}>
              <Text font="headline">{name}</Text>
              {detail?.value?.isPrivate ? (
                <Image systemName="lock.fill" imageScale="small" foregroundStyle="tertiaryLabel" />
              ) : null}
            </HStack>
            <Text font="footnote" foregroundStyle="secondaryLabel">
              {`${owner}/${name}`}
            </Text>
            {detail?.value?.description ? (
              <Text font="footnote" foregroundStyle="secondaryLabel" lineLimit={3}>
                {detail.value.description}
              </Text>
            ) : null}
          </VStack>
        ) : (
          <Text font="footnote" foregroundStyle="secondaryLabel">
            {path}
          </Text>
        )
      }
      footer={
        isRoot && detail?.value ? (
          <VStack alignment="leading" spacing={2}>
            <Text font="footnote" foregroundStyle="secondaryLabel">
              {`最后更新 ${relativeTime(detail.value.pushedAt)}`}
            </Text>
            <Text font="footnote" foregroundStyle="secondaryLabel">
              {`${detail.value.language || "未知语言"} · ${detail.value.stars} stars · ${detail.value.forks} forks`}
            </Text>
          </VStack>
        ) : undefined
      }
    >
      <Button buttonStyle="plain" action={pickBranch}>
        <HStack spacing={10}>
          <Image systemName="arrow.triangle.branch" foregroundStyle="systemBlue" />
          <Text>{currentRef || "加载中…"}</Text>
          <Image systemName="chevron.up.chevron.down" imageScale="small" foregroundStyle="secondaryLabel" />
          <Spacer />
          <Text font="footnote" foregroundStyle="secondaryLabel">
            切换分支
          </Text>
        </HStack>
      </Button>
    </Section>
  )

  return (
    <List
      navigationTitle={isRoot ? name : path.split("/").pop() || name}
      navigationBarTitleDisplayMode={isRoot ? "large" : "inline"}
      searchable={{
        value: fileQuery,
        presented: searchPresented,
        prompt: "搜索文件名",
      }}
      refreshable={async () => {
        await refreshAll()
      }}
      toolbar={
        isRoot
          ? {
              topBarTrailing: (
                <Menu title="仓库操作" systemImage="ellipsis.circle">
                  <Button title="刷新" systemImage="arrow.clockwise" action={refreshAll} />
                  <Button
                    title={starredState ? "取消 Star" : "Star"}
                    systemImage={starredState ? "star.slash" : "star"}
                    action={toggleStar}
                  />
                  <Button
                    title={favorite ? "取消收藏" : "收藏"}
                    systemImage={favorite ? "star.slash.fill" : "star.fill"}
                    action={() => {
                      toggleFavoriteRepo(`${owner}/${name}`)
                      emitters.favorites.emit()
                    }}
                  />
                  <Button
                    title="复制仓库地址"
                    systemImage="doc.on.doc"
                    action={async () => {
                      await Pasteboard.setString(`https://github.com/${owner}/${name}`)
                    }}
                  />
                  <Button
                    title="分享"
                    systemImage="square.and.arrow.up"
                    action={async () => {
                      await ShareSheet.present([`https://github.com/${owner}/${name}`])
                    }}
                  />
                  <Button
                    title="在浏览器打开"
                    systemImage="safari"
                    action={async () => {
                      await Safari.openURL(`https://github.com/${owner}/${name}`)
                    }}
                  />
                </Menu>
              ),
            }
          : undefined
      }
    >
      {error ? (
        <Section title={error.title}>
          <ErrorBanner info={error} onRetry={refreshAll} onDismiss={() => setError(null)} />
        </Section>
      ) : null}

      {isRoot ? header : null}

      {keyword === "" && searchPresented.value && getRecentSearches().length > 0 ? (
        <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">最近搜索</Text>}>
          {getRecentSearches().map(item => (
            <Button
              key={item}
              buttonStyle="plain"
              action={() => fileQuery.setValue(item)}
            >
              <HStack spacing={10}>
                <Image systemName="clock.arrow.circlepath" imageScale="small" foregroundStyle="tertiaryLabel" />
                <Text lineLimit={1}>{item}</Text>
                <Spacer />
              </HStack>
            </Button>
          ))}
        </Section>
      ) : null}

      {keyword ? (
        <Section
          header={<Text font="footnote" foregroundStyle="secondaryLabel">{`搜索结果 · ${path || "/"}`}</Text>}
          footer={<Hint text="只搜索当前目录已加载的内容。" />}
        >
          {filtered.length === 0 ? (
            <EmptyState icon="magnifyingglass" title="没有匹配的文件" />
          ) : (
            filtered.map(entry => renderEntry(entry))
          )}
        </Section>
      ) : (
        <Section
          header={
            <Text font="footnote" foregroundStyle="secondaryLabel">
              {path ? path : "根目录"}
            </Text>
          }
          footer={
            dir ? (
              <Text font="footnote" foregroundStyle="secondaryLabel">
                {`${entries.length} 个项目 · ${dir.fromCache ? "缓存于" : "更新于"} ${relativeTime(dir.ts)}`}
              </Text>
            ) : undefined
          }
        >
          {dir === null ? (
            <HStack spacing={10}>
              <Image systemName="arrow.triangle.2.circlepath" foregroundStyle="secondaryLabel" />
              <Text foregroundStyle="secondaryLabel">正在加载目录…</Text>
            </HStack>
          ) : entries.length === 0 ? (
            <EmptyState icon="folder" title="空目录" />
          ) : (
            entries.map(entry => renderEntry(entry))
          )}
        </Section>
      )}

      {isRoot ? (
        <Section
          header={<Text font="footnote" foregroundStyle="secondaryLabel">仓库操作</Text>}
          footer={<Hint text="仓库文件默认只读，打开文件后可以从菜单里选择「编辑并提交」。" />}
        >
          <NavigationLink destination={<CommitsView owner={owner} repo={name} defaultBranch={detail?.value?.defaultBranch || "main"} />}>
            <HStack spacing={10}>
              <Image systemName="clock.arrow.circlepath" foregroundStyle="systemBlue" />
              <Text>提交记录</Text>
              <Spacer />
            </HStack>
          </NavigationLink>
          <NavigationLink destination={<BranchesListView owner={owner} repo={name} defaultBranch={detail?.value?.defaultBranch || "main"} />}>
            <HStack spacing={10}>
              <Image systemName="arrow.triangle.branch" foregroundStyle="systemGreen" />
              <Text>Branches</Text>
              <Spacer />
            </HStack>
          </NavigationLink>
          <NavigationLink destination={<RefsView owner={owner} repo={name} kind="tags" />}>
            <HStack spacing={10}>
              <Image systemName="tag" foregroundStyle="systemOrange" />
              <Text>Tags</Text>
              <Spacer />
            </HStack>
          </NavigationLink>
          <NavigationLink destination={<RefsView owner={owner} repo={name} kind="releases" />}>
            <HStack spacing={10}>
              <Image systemName="shippingbox" foregroundStyle="systemPurple" />
              <Text>Releases</Text>
              <Spacer />
            </HStack>
          </NavigationLink>
        </Section>
      ) : null}
    </List>
  )

  function renderEntry(entry: FileEntry) {
    const isDir = entry.type === "dir" || entry.type === "submodule"
    const rawURL = `https://raw.githubusercontent.com/${owner}/${name}/${currentRef || "main"}/${entry.path}`
    const htmlURL = `https://github.com/${owner}/${name}/blob/${currentRef || "main"}/${entry.path}`
    const row = (
      <HStack
        spacing={10}
        contextMenu={{
          menuItems: (
            <Group>
              <Button
                title="复制路径"
                systemImage="doc.on.doc"
                action={async () => {
                  await Pasteboard.setString(entry.path)
                }}
              />
              {!isDir ? (
                <Button
                  title="复制 Raw URL"
                  systemImage="link"
                  action={async () => {
                    await Pasteboard.setString(rawURL)
                  }}
                />
              ) : null}
              <Button
                title="分享"
                systemImage="square.and.arrow.up"
                action={async () => {
                  await ShareSheet.present([isDir ? htmlURL : rawURL])
                }}
              />
              <Button
                title="在 GitHub 打开"
                systemImage="safari"
                action={async () => {
                  await Safari.openURL(htmlURL)
                }}
              />
            </Group>
          ),
        }}
      >
        <Image systemName={fileIcon(entry.name, entry.type)} foregroundStyle={fileTint(entry.name, entry.type)} />
        <Text lineLimit={1}>{entry.name}</Text>
        <Spacer />
        {!isDir ? (
          <Text font="caption" foregroundStyle="tertiaryLabel">
            {fileSize(entry.size)}
          </Text>
        ) : null}
      </HStack>
    )

    if (isDir) {
      return (
        <NavigationLink
          key={entry.path}
          destination={
            <RepositoryDetailView owner={owner} name={name} path={entry.path} ref={currentRef || undefined} />
          }
        >
          {row}
        </NavigationLink>
      )
    }
    return (
      <NavigationLink
        key={entry.path}
        destination={
          <FilePreviewView
            owner={owner}
            repo={name}
            ref={currentRef || "main"}
            path={entry.path}
            sha={entry.sha}
            knownSize={entry.size}
          />
        }
      >
        {row}
      </NavigationLink>
    )
  }
}
