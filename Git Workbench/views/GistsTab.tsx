/**
 * Tab 2：Gist
 *
 * §43：列表以「文件名」为主，而不是 Gist 编号 —— 用户更容易通过文件名认出 Gist。
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
import { Gist } from "../types"
import { getActiveLogin } from "../api/auth"
import { loadGists } from "../services/loaders"
import { draftsFor } from "../services/drafts"
import {
  getSettings,
  isFavoriteGist,
  netState,
  toggleFavoriteGist,
  updateSettings,
} from "../services/store"
import { emitters } from "../utils/emitter"
import { useWatch } from "../utils/hooks"
import { ErrorInfo, toErrorInfo } from "../utils/errors"
import { relativeTime, truncate } from "../utils/format"
import {
  filterGists,
  gistFilterSummary,
  isGistFilterActive,
  sortGists,
} from "../utils/listQuery"
import { CreateGistView } from "./CreateGistView"
import { EmptyState, ErrorBanner, ExitAppButton, Hint } from "./components"
import { GistDetailView } from "./GistDetailView"
import { ListOptionsSheet } from "./ListOptionsSheet"

type Loaded<T> = { value: T | null; ts: number; fromCache: boolean; error: unknown | null }

export function gistTitle(gist: Gist): string {
  if (gist.files.length > 0 && gist.files[0].filename) return gist.files[0].filename
  if (gist.description) return gist.description
  return `Gist ${gist.id.slice(0, 8)}`
}

export function gistSubtitle(gist: Gist): string {
  const visibility = gist.isPublic ? "Public" : "Secret"
  const fileLabel = `${gist.files.length} 个文件`
  if (gist.files.length > 1) {
    return `${visibility} · ${fileLabel} · ${gist.files.map(f => f.filename).slice(1, 3).join("、")}`
  }
  return `${visibility} · ${fileLabel}`
}

export function GistsTab() {
  const query = useObservable("")
  const [gists, setGists] = useState<Loaded<Gist[]> | null>(null)
  const [sheetMode, setSheetMode] = useState<"create" | "options" | null>(null)
  useWatch(emitters.favorites, emitters.drafts, emitters.gists, emitters.settings, emitters.account)

  const login = getActiveLogin()
  const previousLogin = useRef<string | null>(login)

  async function refresh(force: boolean) {
    const result = await loadGists(force)
    setGists(result)
  }

  // 首次进入用缓存，切换账户时强制刷新（缓存按账户隔离）
  useEffect(() => {
    const switched = previousLogin.current !== login && previousLogin.current !== null
    previousLogin.current = login
    refresh(switched)
  }, [login])

  const keyword = (query.value || "").trim().toLowerCase()
  const all = gists?.value || []
  const matches = (gist: Gist) =>
    `${gist.files.map(f => f.filename).join(" ")} ${gist.description}`.toLowerCase().indexOf(keyword) !== -1

  const settings = getSettings()
  const gistFilter = settings.gistFilter
  const hasPendingDraft = (gist: Gist) =>
    draftsFor(`gist:${gist.id}`).some(draft => draft.state !== "synced")
  const draftIDs = all.filter(hasPendingDraft).map(gist => gist.id)
  const visible = sortGists(filterGists(all, gistFilter, isFavoriteGist, draftIDs), settings.gistSort)
  const filterActive = isGistFilterActive(gistFilter) || settings.gistSort !== "updated"

  const favorites = visible.filter(gist => isFavoriteGist(gist.id))
  const withDrafts = visible.filter(hasPendingDraft)
  const others = visible.filter(gist => !isFavoriteGist(gist.id))
  const error: ErrorInfo | null = gists?.error ? toErrorInfo(gists.error, "加载 Gist 失败") : null

  function clearFilters() {
    updateSettings({
      gistSort: "updated",
      gistFilter: { visibility: "all", favoritesOnly: false, draftsOnly: false },
    })
  }

  function renderGist(gist: Gist) {
    const draftCount = draftsFor(`gist:${gist.id}`).filter(d => d.state !== "synced").length
    const favorite = isFavoriteGist(gist.id)
    return (
      <NavigationLink
        key={gist.id}
        destination={<GistDetailView gistId={gist.id} />}
        contextMenu={{
          menuItems: (
            <Group>
              <Button
                title={favorite ? "取消收藏" : "收藏"}
                systemImage={favorite ? "star.slash" : "star"}
                action={() => {
                  toggleFavoriteGist(gist.id)
                  emitters.favorites.emit()
                }}
              />
              <Button
                title="复制 Raw URL"
                systemImage="link"
                action={async () => {
                  await Pasteboard.setString(gist.files[0]?.rawURL || gist.htmlURL)
                }}
              />
              <Button
                title="分享"
                systemImage="square.and.arrow.up"
                action={async () => {
                  await ShareSheet.present([gist.htmlURL])
                }}
              />
              <Button
                title="在浏览器打开"
                systemImage="safari"
                action={async () => {
                  await Safari.openURL(gist.htmlURL)
                }}
              />
            </Group>
          ),
        }}
        trailingSwipeActions={{
          allowsFullSwipe: true,
          actions: [
            <Button
              title={favorite ? "取消收藏" : "收藏"}
              systemImage={favorite ? "star.slash.fill" : "star.fill"}
              action={() => {
                toggleFavoriteGist(gist.id)
                emitters.favorites.emit()
              }}
            />,
          ],
        }}
      >
        <VStack alignment="leading" spacing={3} padding={{ vertical: 5 }}>
          <HStack spacing={6}>
            <Text font="headline" lineLimit={1}>
              {gistTitle(gist)}
            </Text>
            {favorite ? (
              <Image systemName="star.fill" imageScale="small" foregroundStyle="systemYellow" />
            ) : null}
            <Spacer />
            {draftCount > 0 ? (
              <HStack spacing={4}>
                <Image systemName="circle.dashed" imageScale="small" foregroundStyle="systemOrange" />
                <Text font="caption" foregroundStyle="systemOrange">
                  本地修改
                </Text>
              </HStack>
            ) : null}
          </HStack>
          <Text font="footnote" foregroundStyle="secondaryLabel" lineLimit={1}>
            {gistSubtitle(gist)}
          </Text>
          <HStack spacing={8}>
            <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
              {gist.description ? truncate(gist.description, 32) : "无描述"}
            </Text>
            <Spacer />
            <Text font="caption" foregroundStyle="tertiaryLabel">
              {relativeTime(gist.updatedAt)}
            </Text>
          </HStack>
        </VStack>
      </NavigationLink>
    )
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="Gist"
        searchable={{ value: query, prompt: "搜索 Gist" }}
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
            sheetMode === "create" ? (
              <CreateGistView
                onCreated={async () => {
                  await refresh(true)
                  emitters.gists.emit()
                }}
              />
            ) : (
              <ListOptionsSheet kind="gist" />
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
              title="新建 Gist"
              systemImage="plus"
              action={() => setSheetMode("create")}
            />,
            <Menu title="更多" systemImage="ellipsis.circle">
              <Button
                title="刷新"
                systemImage="arrow.clockwise"
                action={async () => {
                  await refresh(true)
                }}
              />
            </Menu>,
          ],
        }}
      >
        {error ? (
          <Section title={error.title}>
            <ErrorBanner info={error} onRetry={() => refresh(true)} onDismiss={() => undefined} />
          </Section>
        ) : null}

        {keyword ? (
          <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">搜索结果</Text>}>
            {all.filter(matches).length === 0 ? (
              <EmptyState icon="magnifyingglass" title="没有匹配的 Gist" />
            ) : (
              all.filter(matches).map(renderGist)
            )}
          </Section>
        ) : (
          <Group>
            {withDrafts.length > 0 ? (
              <Section
                header={<Text font="footnote" foregroundStyle="secondaryLabel">有未同步的修改</Text>}
                footer={<Hint text="这些 Gist 的本地草稿还没有上传到 GitHub。" />}
              >
                {withDrafts.map(renderGist)}
              </Section>
            ) : null}

            {favorites.length > 0 ? (
              <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">收藏</Text>}>
                {favorites.map(renderGist)}
              </Section>
            ) : null}

            <Section
              header={<Text font="footnote" foregroundStyle="secondaryLabel">我的 Gist</Text>}
              footer={
                <VStack alignment="leading" spacing={2}>
                  {gists ? (
                    <Text font="footnote" foregroundStyle="secondaryLabel">
                      {`${gists.fromCache ? "缓存于" : "更新于"} ${relativeTime(gists.ts)}`}
                    </Text>
                  ) : (
                    <Text font="footnote" foregroundStyle="secondaryLabel">
                      正在加载…
                    </Text>
                  )}
                  <Hint text="下拉刷新；点 ＋ 可以创建新的 Gist。" />
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
                    {gistFilterSummary(gistFilter, settings.gistSort)}
                  </Text>
                  <Spacer />
                  <Button title="清除" buttonStyle="borderless" action={clearFilters} />
                </HStack>
              ) : null}
              {!netState.online ? (
                <HStack spacing={8}>
                  <Image systemName="wifi.slash" imageScale="small" foregroundStyle="systemOrange" />
                  <Text font="footnote" foregroundStyle="secondaryLabel">
                    离线：当前显示的是缓存内容，仍可编辑本地草稿。
                  </Text>
                </HStack>
              ) : null}
              {gists === null ? (
                <HStack spacing={10}>
                  <Image systemName="arrow.triangle.2.circlepath" foregroundStyle="secondaryLabel" />
                  <Text foregroundStyle="secondaryLabel">正在加载 Gist…</Text>
                </HStack>
              ) : others.length === 0 ? (
                filterActive ? (
                  <EmptyState
                    icon="line.3.horizontal.decrease.circle"
                    title="没有符合条件的 Gist"
                    message="试试放宽筛选条件，或点「清除」。"
                  />
                ) : (
                  <EmptyState
                    icon="doc.text"
                    title="还没有 Gist"
                    message="点右上角 ＋ 新建一个，或下拉刷新。"
                  />
                )
              ) : (
                others.map(renderGist)
              )}
            </Section>
          </Group>
        )}
      </List>
    </NavigationStack>
  )
}
