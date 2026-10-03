/**
 * Tab 1：仓库
 *
 * 结构：收藏 / 最近访问 / 我的仓库 / Starred。
 * 数据先读缓存再按需刷新，避免频繁打 GitHub API。
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
  useRef,
  useState,
} from "scripting"
import { FileEntry, Repository } from "../types"
import { getActiveLogin } from "../api/auth"
import { cacheGet, cacheKeys } from "../services/cache"
import { loadMyRepositories, loadStarredRepositories } from "../services/loaders"
import {
  getFavorites,
  getRecent,
  getSettings,
  isFavoriteRepo,
  netState,
  updateSettings,
} from "../services/store"
import { emitters } from "../utils/emitter"
import { useWatch } from "../utils/hooks"
import { ErrorInfo, toErrorInfo } from "../utils/errors"
import { fileIcon, fileTint } from "../utils/filetype"
import { relativeTime } from "../utils/format"
import {
  filterRepositories,
  isRepoFilterActive,
  repoFilterSummary,
  repoLanguages,
  sortRepositories,
} from "../utils/listQuery"
import { AddRepositorySheet } from "./AddRepositorySheet"
import { EmptyState, ErrorBanner, ExitAppButton, Hint } from "./components"
import { FilePreviewView } from "./FilePreviewView"
import { GlobalSearchSheet } from "./GlobalSearchSheet"
import { ListOptionsSheet } from "./ListOptionsSheet"
import { RepositoryDetailView } from "./RepositoryDetailView"
import { RepositoryLink, RepositoryRow, placeholderRepository } from "./RepositoryRow"

type RepoListState = {
  repos: Repository[]
  ts: number
  fromCache: boolean
  error: unknown | null
}

export function RepositoriesTab() {
  const query = useObservable("")
  const [my, setMy] = useState<RepoListState | null>(null)
  const [starred, setStarred] = useState<RepoListState | null>(null)
  const starredExpanded = useObservable(false)
  const [sheetMode, setSheetMode] = useState<"add" | "search" | "options" | null>(null)
  useWatch(emitters.favorites, emitters.recent, emitters.settings, emitters.account)

  const login = getActiveLogin()
  const previousLogin = useRef<string | null>(login)

  async function refresh(force: boolean) {
    const result = await loadMyRepositories(force)
    setMy({
      repos: result.value || [],
      ts: result.ts,
      fromCache: result.fromCache,
      error: result.error,
    })
  }

  async function loadStarred(force: boolean) {
    const result = await loadStarredRepositories(force)
    setStarred({
      repos: result.value || [],
      ts: result.ts,
      fromCache: result.fromCache,
      error: result.error,
    })
  }

  // 首次进入用缓存，切换账户时强制刷新（缓存本身也按账户隔离）
  useEffect(() => {
    const switched = previousLogin.current !== login && previousLogin.current !== null
    previousLogin.current = login
    setStarred(null)
    refresh(switched)
    if (starredExpanded.value) loadStarred(switched)
  }, [login])

  // 展开 Starred 时才去拉取
  useEffect(() => {
    if (starredExpanded.value && starred === null) loadStarred(false)
  }, [starredExpanded.value])

  const favorites = getFavorites().repos
  const recentFiles = getRecent().filter(item => item.kind === "repo_file").slice(0, 6)
  const keyword = (query.value || "").trim().toLowerCase()
  const settings = getSettings()
  const repoFilter = settings.repoFilter
  const filterActive = isRepoFilterActive(repoFilter) || settings.repoSort !== "updated"

  const myRepos = my
    ? sortRepositories(filterRepositories(my.repos, repoFilter, isFavoriteRepo), settings.repoSort)
    : []
  const starredRepos = starred
    ? sortRepositories(
        filterRepositories(starred.repos, repoFilter, isFavoriteRepo),
        settings.repoSort
      )
    : []
  const languages = repoLanguages([...(my?.repos || []), ...(starred?.repos || [])])

  function clearFilters() {
    updateSettings({
      repoSort: "updated",
      repoFilter: { visibility: "all", kind: "all", language: null, favoritesOnly: false },
    })
  }

  function findRepo(fullName: string): Repository {
    const inMine = my?.repos.find(repo => repo.fullName === fullName)
    if (inMine) return inMine
    const inStarred = starred?.repos.find(repo => repo.fullName === fullName)
    if (inStarred) return inStarred
    const cached = cacheGet<Repository>(cacheKeys.repository(fullName))
    if (cached && cached.value) return cached.value
    return placeholderRepository(fullName)
  }

  const favoriteRepos = favorites.map(findRepo)
  const allKnown = [
    ...(my?.repos || []),
    ...(starred?.repos || []),
    ...favoriteRepos.filter(repo => !(my?.repos || []).some(item => item.fullName === repo.fullName)),
  ]

  const searchResults = keyword
    ? allKnown
        .filter((repo, index, list) => list.findIndex(item => item.fullName === repo.fullName) === index)
        .filter(repo =>
          `${repo.fullName} ${repo.description} ${repo.language || ""}`.toLowerCase().indexOf(keyword) !== -1
        )
    : []

  const errorInfo: ErrorInfo | null = my?.error ? toErrorInfo(my.error, "加载仓库失败") : null

  return (
    <NavigationStack>
      <List
        navigationTitle="仓库"
        searchable={{ value: query, prompt: "搜索仓库" }}
        refreshable={async () => {
          await refresh(true)
        }}
        // 只用一个 sheet：同一个页面上挂多个 modal 在真机上不总可靠，
        // 所以用状态区分要弹哪一个
        sheet={{
          isPresented: sheetMode !== null,
          onChanged: (presented: boolean) => {
            if (!presented) setSheetMode(null)
          },
          content:
            sheetMode === "add" ? (
              <AddRepositorySheet known={allKnown} />
            ) : sheetMode === "search" ? (
              <GlobalSearchSheet />
            ) : (
              <ListOptionsSheet kind="repo" languages={languages} />
            ),
        }}
        toolbar={{
          topBarLeading: <ExitAppButton />,
          topBarTrailing: [
            <Button
              title="排序与筛选"
              systemImage={
                filterActive
                  ? "line.3.horizontal.decrease.circle.fill"
                  : "line.3.horizontal.decrease.circle"
              }
              action={() => setSheetMode("options")}
            />,
            <Button
              title="添加仓库"
              systemImage="plus"
              action={() => setSheetMode("add")}
            />,
            <Menu title="更多" systemImage="ellipsis.circle">
              <Button
                title="全局搜索"
                systemImage="magnifyingglass"
                action={() => setSheetMode("search")}
              />
              <Button
                title={settings.showRecentRepositories ? "隐藏最近访问" : "显示最近访问"}
                systemImage={settings.showRecentRepositories ? "eye.slash" : "eye"}
                action={() =>
                  updateSettings({ showRecentRepositories: !settings.showRecentRepositories })
                }
              />
              <Button
                title="刷新全部"
                systemImage="arrow.clockwise"
                action={async () => {
                  await refresh(true)
                  if (starred) await loadStarred(true)
                }}
              />
            </Menu>,
          ],
        }}
      >
        {errorInfo ? (
          <Section title={errorInfo.title}>
            <ErrorBanner info={errorInfo} onRetry={() => refresh(true)} />
          </Section>
        ) : null}

        {keyword ? (
          <Section
            header={<Text font="footnote" foregroundStyle="secondaryLabel">搜索结果</Text>}
            footer={<Hint text={`在已加载的 ${allKnown.length} 个仓库中匹配「${query.value}」。`} />}
          >
            {searchResults.length === 0 ? (
              <EmptyState icon="magnifyingglass" title="没有匹配的仓库" />
            ) : (
              searchResults.map(repo => (
                <RepositoryLink
                  key={repo.fullName}
                  repo={repo}
                  destination={
                    <RepositoryDetailView owner={repo.owner} name={repo.name} />
                  }
                />
              ))
            )}
          </Section>
        ) : (
          <Group>
            {favoriteRepos.length > 0 ? (
              <Section
                header={<Text font="footnote" foregroundStyle="secondaryLabel">收藏</Text>}
                footer={<Hint text="长按或左滑可以取消收藏。" />}
              >
                {favoriteRepos.map(repo => (
                  <RepositoryLink
                    key={`fav-${repo.fullName}`}
                    repo={repo}
                    destination={
                      <RepositoryDetailView owner={repo.owner} name={repo.name} />
                    }
                  />
                ))}
              </Section>
            ) : null}

            {settings.showRecentRepositories && recentFiles.length > 0 ? (
              <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">最近访问</Text>}>
                {recentFiles.map(item => (
                  <NavigationLink
                    key={item.key}
                    destination={
                      <FilePreviewView
                        owner={item.targetID.split("/")[0]}
                        repo={item.targetID.split("/")[1]}
                        ref={item.ref}
                        path={item.filename}
                      />
                    }
                  >
                    <HStack spacing={10}>
                      <Image
                        systemName={fileIcon(item.filename)}
                        foregroundStyle={fileTint(item.filename)}
                      />
                      <VStack alignment="leading" spacing={2}>
                        <Text lineLimit={1}>{item.title}</Text>
                        <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
                          {item.subtitle}
                        </Text>
                      </VStack>
                      <Spacer />
                      <Text font="caption" foregroundStyle="tertiaryLabel">
                        {relativeTime(item.ts)}
                      </Text>
                    </HStack>
                  </NavigationLink>
                ))}
              </Section>
            ) : null}

            <Section
              header={<Text font="footnote" foregroundStyle="secondaryLabel">我的仓库</Text>}
              footer={
                <VStack alignment="leading" spacing={2}>
                  {my ? (
                    <Text font="footnote" foregroundStyle="secondaryLabel">
                      {`${my.fromCache ? "缓存于" : "更新于"} ${relativeTime(my.ts)}`}
                    </Text>
                  ) : null}
                  <Hint text="下拉可以刷新。" />
                </VStack>
              }
            >
              {filterActive ? (
                <HStack spacing={8}>
                  <Image
                    systemName="line.3.horizontal.decrease.circle"
                    imageScale="small"
                    foregroundStyle="systemBlue"
                  />
                  <Text font="footnote" foregroundStyle="secondaryLabel" lineLimit={2}>
                    {repoFilterSummary(repoFilter, settings.repoSort)}
                  </Text>
                  <Spacer />
                  <Button title="清除" buttonStyle="borderless" action={clearFilters} />
                </HStack>
              ) : null}
              {!netState.online ? (
                <HStack spacing={8}>
                  <Image systemName="wifi.slash" imageScale="small" foregroundStyle="systemOrange" />
                  <Text font="footnote" foregroundStyle="secondaryLabel">
                    离线：当前显示的是缓存内容。
                  </Text>
                </HStack>
              ) : null}
              {my === null ? (
                <HStack spacing={10}>
                  <Image systemName="arrow.triangle.2.circlepath" foregroundStyle="secondaryLabel" />
                  <Text foregroundStyle="secondaryLabel">正在加载仓库…</Text>
                </HStack>
              ) : myRepos.length === 0 ? (
                filterActive ? (
                  <EmptyState
                    icon="line.3.horizontal.decrease.circle"
                    title="没有符合条件的仓库"
                    message="试试放宽筛选条件，或清除筛选。"
                  />
                ) : (
                  <EmptyState
                    icon="folder"
                    title="还没有仓库"
                    message="下拉刷新，或点右上角 ＋ 添加一个仓库。"
                  />
                )
              ) : (
                myRepos.map(repo => (
                  <RepositoryLink
                    key={repo.fullName}
                    repo={repo}
                    destination={
                      <RepositoryDetailView owner={repo.owner} name={repo.name} />
                    }
                  />
                ))
              )}
            </Section>

            <Section
              header={<Text font="footnote" foregroundStyle="secondaryLabel">Starred</Text>}
              isExpanded={starredExpanded}
            >
              {starred === null ? (
                <Text foregroundStyle="secondaryLabel">展开后加载…</Text>
              ) : starredRepos.length === 0 ? (
                <EmptyState
                  icon="star"
                  title={filterActive ? "没有符合条件的仓库" : "还没有 Star 的仓库"}
                />
              ) : (
                starredRepos.map(repo => (
                  <RepositoryLink
                    key={`star-${repo.fullName}`}
                    repo={repo}
                    destination={
                      <RepositoryDetailView owner={repo.owner} name={repo.name} />
                    }
                  />
                ))
              )}
            </Section>
          </Group>
        )}
      </List>
    </NavigationStack>
  )
}
