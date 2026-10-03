/**
 * 全局搜索（§32）：只在本地已缓存 / 最近访问过的内容里找，
 * 不做 GitHub 全网代码搜索。
 */

import {
  Button,
  HStack,
  Image,
  List,
  NavigationLink,
  NavigationStack,
  Section,
  Spacer,
  Text,
  VStack,
  useObservable,
} from "scripting"
import { Gist, Repository } from "../types"
import { cacheGet, cacheKeys } from "../services/cache"
import { getRecent } from "../services/store"
import { fileIcon, fileTint } from "../utils/filetype"
import { relativeTime } from "../utils/format"
import { EmptyState, Hint } from "./components"
import { FilePreviewView } from "./FilePreviewView"
import { GistDetailView } from "./GistDetailView"
import { RepositoryDetailView } from "./RepositoryDetailView"
import { gistSubtitle, gistTitle } from "./GistsTab"

export function GlobalSearchSheet() {
  const query = useObservable("")
  const keyword = (query.value || "").trim().toLowerCase()

  const cachedRepos: Repository[] = [
    ...(cacheGet<Repository[]>(cacheKeys.myRepos())?.value || []),
    ...(cacheGet<Repository[]>(cacheKeys.starredRepos())?.value || []),
  ]
  const cachedGists: Gist[] = cacheGet<Gist[]>(cacheKeys.myGists())?.value || []
  const recents = getRecent()

  const repoHits = keyword
    ? cachedRepos.filter(repo =>
        `${repo.fullName} ${repo.description} ${repo.language || ""}`.toLowerCase().indexOf(keyword) !== -1
      )
    : []
  const gistHits = keyword
    ? cachedGists.filter(
        gist =>
          `${gist.files.map(file => file.filename).join(" ")} ${gist.description}`.toLowerCase().indexOf(keyword) !== -1
      )
    : []
  const fileHits = keyword
    ? recents.filter(item => `${item.title} ${item.filename}`.toLowerCase().indexOf(keyword) !== -1)
    : recents.slice(0, 8)

  return (
    <NavigationStack>
      <List
        navigationTitle="全局搜索"
        navigationBarTitleDisplayMode="inline"
        searchable={{ value: query, prompt: "搜索仓库、Gist、最近文件" }}
      >
        {!keyword ? (
          <Section
            header={<Text font="footnote" foregroundStyle="secondaryLabel">最近文件</Text>}
            footer={<Hint text="搜索范围：已缓存的仓库、Gist 与最近访问过的文件。" />}
          >
            {fileHits.length === 0 ? (
              <EmptyState icon="magnifyingglass" title="还没有最近访问" message="先打开一个文件，这里会留下入口。" />
            ) : (
              fileHits.map(item => (
                <NavigationLink
                  key={item.key}
                  destination={
                    item.kind === "repo_file" ? (
                      <FilePreviewView
                        owner={item.targetID.split("/")[0]}
                        repo={item.targetID.split("/")[1]}
                        ref={item.ref}
                        path={item.filename}
                      />
                    ) : (
                      <GistDetailView gistId={item.targetID} />
                    )
                  }
                >
                  <HStack spacing={10}>
                    <Image systemName={fileIcon(item.filename)} foregroundStyle={fileTint(item.filename)} />
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
              ))
            )}
          </Section>
        ) : (
          <VStack>
            <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">FILES</Text>}>
              {fileHits.length === 0 ? (
                <Text font="footnote" foregroundStyle="secondaryLabel">
                  没有匹配的最近文件
                </Text>
              ) : (
                fileHits.map(item => (
                  <NavigationLink
                    key={item.key}
                    destination={
                      item.kind === "repo_file" ? (
                        <FilePreviewView
                          owner={item.targetID.split("/")[0]}
                          repo={item.targetID.split("/")[1]}
                          ref={item.ref}
                          path={item.filename}
                        />
                      ) : (
                        <GistDetailView gistId={item.targetID} />
                      )
                    }
                  >
                    <VStack alignment="leading" spacing={2}>
                      <Text lineLimit={1}>{item.title}</Text>
                      <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
                        {item.subtitle}
                      </Text>
                    </VStack>
                  </NavigationLink>
                ))
              )}
            </Section>

            <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">REPOSITORIES</Text>}>
              {repoHits.length === 0 ? (
                <Text font="footnote" foregroundStyle="secondaryLabel">
                  没有匹配的仓库
                </Text>
              ) : (
                repoHits.slice(0, 12).map(repo => (
                  <NavigationLink
                    key={repo.fullName}
                    destination={<RepositoryDetailView owner={repo.owner} name={repo.name} />}
                  >
                    <VStack alignment="leading" spacing={2}>
                      <Text lineLimit={1}>{repo.name}</Text>
                      <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
                        {repo.fullName}
                      </Text>
                    </VStack>
                  </NavigationLink>
                ))
              )}
            </Section>

            <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">GISTS</Text>}>
              {gistHits.length === 0 ? (
                <Text font="footnote" foregroundStyle="secondaryLabel">
                  没有匹配的 Gist
                </Text>
              ) : (
                gistHits.slice(0, 12).map(gist => (
                  <NavigationLink key={gist.id} destination={<GistDetailView gistId={gist.id} />}>
                    <VStack alignment="leading" spacing={2}>
                      <Text lineLimit={1}>{gistTitle(gist)}</Text>
                      <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
                        {gistSubtitle(gist)}
                      </Text>
                    </VStack>
                  </NavigationLink>
                ))
              )}
            </Section>
          </VStack>
        )}
      </List>
    </NavigationStack>
  )
}
