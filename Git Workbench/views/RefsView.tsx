/** Tags / Releases 列表 */

import {
  Button,
  HStack,
  Image,
  List,
  NavigationLink,
  Section,
  Spacer,
  Text,
  VStack,
  useEffect,
  useState,
} from "scripting"
import { Release, RepoTag } from "../types"
import { loadReleases, loadTags } from "../services/loaders"
import { ErrorInfo, toErrorInfo } from "../utils/errors"
import { dateOnly, relativeTime } from "../utils/format"
import { CommitDetailView } from "./CommitsView"
import { EmptyState, ErrorBanner, Hint } from "./components"

export function RefsView({
  owner,
  repo,
  kind,
}: {
  owner: string
  repo: string
  kind: "tags" | "releases"
}) {
  const [tags, setTags] = useState<RepoTag[] | null>(null)
  const [releases, setReleases] = useState<Release[] | null>(null)
  const [error, setError] = useState<ErrorInfo | null>(null)

  async function load(force = true) {
    if (kind === "tags") {
      const result = await loadTags(owner, repo)
      if (result.error && !result.value) {
        setError(toErrorInfo(result.error, "加载 Tags 失败"))
        return
      }
      setError(null)
      setTags(result.value || [])
    } else {
      const result = await loadReleases(owner, repo)
      if (result.error && !result.value) {
        setError(toErrorInfo(result.error, "加载 Releases 失败"))
        return
      }
      setError(null)
      setReleases(result.value || [])
    }
  }

  useEffect(() => {
    load()
  }, [kind, owner, repo])

  const title = kind === "tags" ? "Tags" : "Releases"

  return (
    <List
      navigationTitle={title}
      navigationBarTitleDisplayMode="inline"
      refreshable={async () => {
        await load(true)
      }}
    >
      {error ? (
        <Section title={error.title}>
          <ErrorBanner info={error} onRetry={() => load(true)} onDismiss={() => setError(null)} />
        </Section>
      ) : null}

      {kind === "tags" ? (
        <Section
          header={
            <Text font="footnote" foregroundStyle="secondaryLabel">
              {`${tags?.length ?? 0} 个标签`}
            </Text>
          }
        >
          {tags === null ? (
            <Text foregroundStyle="secondaryLabel">正在加载…</Text>
          ) : tags.length === 0 ? (
            <EmptyState icon="tag" title="没有标签" />
          ) : (
            tags.map(tag => (
              <NavigationLink
                key={tag.name}
                destination={<CommitDetailView owner={owner} repo={repo} sha={tag.sha} />}
              >
                <HStack spacing={10}>
                  <Image systemName="tag" foregroundStyle="systemOrange" />
                  <VStack alignment="leading" spacing={2}>
                    <Text lineLimit={1}>{tag.name}</Text>
                    <Text font="caption" foregroundStyle="tertiaryLabel">
                      {tag.sha ? tag.sha.slice(0, 7) : ""}
                    </Text>
                  </VStack>
                  <Spacer />
                </HStack>
              </NavigationLink>
            ))
          )}
        </Section>
      ) : (
        <Section
          header={
            <Text font="footnote" foregroundStyle="secondaryLabel">
              {`${releases?.length ?? 0} 个发布`}
            </Text>
          }
          footer={<Hint text="点击可在 GitHub 上查看完整说明与下载资源。" />}
        >
          {releases === null ? (
            <Text foregroundStyle="secondaryLabel">正在加载…</Text>
          ) : releases.length === 0 ? (
            <EmptyState icon="shippingbox" title="没有 Release" />
          ) : (
            releases.map(release => (
              <VStack key={release.id} alignment="leading" spacing={4} padding={{ vertical: 4 }}>
                <HStack spacing={8}>
                  <Text font="headline" lineLimit={1}>
                    {release.name || release.tagName}
                  </Text>
                  {release.prerelease ? (
                    <Text font="caption" foregroundStyle="systemOrange">
                      Pre-release
                    </Text>
                  ) : null}
                  <Spacer />
                </HStack>
                <Text font="caption" foregroundStyle="tertiaryLabel">
                  {`${release.tagName} · ${release.publishedAt ? dateOnly(release.publishedAt) : ""} · ${relativeTime(release.publishedAt)}`}
                </Text>
                {release.body ? (
                  <Text font="footnote" foregroundStyle="secondaryLabel" lineLimit={3}>
                    {release.body}
                  </Text>
                ) : null}
                <HStack spacing={12}>
                  <Button
                    title="在浏览器打开"
                    systemImage="safari"
                    buttonStyle="bordered"
                    action={async () => {
                      await Safari.openURL(release.htmlURL)
                    }}
                  />
                </HStack>
              </VStack>
            ))
          )}
        </Section>
      )}
    </List>
  )
}
