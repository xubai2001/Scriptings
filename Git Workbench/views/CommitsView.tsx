/** 提交记录 / 提交详情 / Diff（§11） */

import {
  Button,
  Editor,
  HStack,
  Image,
  List,
  Menu,
  Navigation,
  NavigationLink,
  Section,
  Spacer,
  Text,
  VStack,
  useEffect,
  useMemo,
  useState,
} from "scripting"
import { Commit, CommitDetail } from "../types"
import { getCommit } from "../api/repos"
import { loadBranches, loadCommits } from "../services/loaders"
import { ErrorInfo, toErrorInfo } from "../utils/errors"
import { commitBody, commitTitle, relativeTime } from "../utils/format"
import { BranchPickerSheet } from "./BranchesView"
import { ErrorBanner, Hint } from "./components"

export function CommitsView({
  owner,
  repo,
  defaultBranch,
}: {
  owner: string
  repo: string
  defaultBranch: string
}) {
  const [ref, setRef] = useState(defaultBranch)
  const [commits, setCommits] = useState<Commit[] | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<ErrorInfo | null>(null)

  async function load(nextPage: number, replace: boolean) {
    const result = await loadCommits(owner, repo, ref, nextPage)
    if (result.error && !result.value) {
      setError(toErrorInfo(result.error, "加载提交记录失败"))
      setCommits(prev => prev || [])
      return
    }
    setError(result.error ? toErrorInfo(result.error, "刷新失败（显示缓存内容）") : null)
    const list = result.value || []
    setHasMore(list.length >= 30)
    setPage(nextPage)
    setCommits(prev => (replace || !prev ? list : [...prev, ...list]))
  }

  useEffect(() => {
    load(1, true)
  }, [ref])

  async function pickBranch() {
    const branches = (await loadBranches(owner, repo, false)).value || []
    const picked = await Navigation.present<string | null>(
      <BranchPickerSheet
        owner={owner}
        repo={repo}
        branches={branches}
        current={ref}
        defaultBranch={defaultBranch}
      />
    )
    if (picked) setRef(picked)
  }

  return (
    <List
      navigationTitle="Commits"
      navigationBarTitleDisplayMode="inline"
      refreshable={async () => {
        await load(1, true)
      }}
      toolbar={{
        topBarTrailing: (
          <Menu title="更多" systemImage="ellipsis.circle">
            <Button title={`分支：${ref}`} systemImage="arrow.triangle.branch" action={pickBranch} />
            <Button title="刷新" systemImage="arrow.clockwise" action={() => load(1, true)} />
          </Menu>
        ),
      }}
    >
      {error ? (
        <Section title={error.title}>
          <ErrorBanner info={error} onRetry={() => load(1, true)} onDismiss={() => setError(null)} />
        </Section>
      ) : null}

      <Section
        header={
          <Button buttonStyle="plain" action={pickBranch}>
            <HStack spacing={8}>
              <Image systemName="arrow.triangle.branch" foregroundStyle="systemBlue" imageScale="small" />
              <Text font="footnote">{ref}</Text>
              <Image systemName="chevron.up.chevron.down" imageScale="small" foregroundStyle="secondaryLabel" />
              <Spacer />
              <Text font="footnote" foregroundStyle="secondaryLabel">
                切换分支
              </Text>
            </HStack>
          </Button>
        }
      >
        {commits === null ? (
          <Text foregroundStyle="secondaryLabel">正在加载…</Text>
        ) : commits.length === 0 ? (
          <Text foregroundStyle="secondaryLabel">这个分支还没有提交。</Text>
        ) : (
          commits.map(commit => (
            <NavigationLink
              key={commit.sha}
              destination={<CommitDetailView owner={owner} repo={repo} sha={commit.sha} />}
            >
              <VStack alignment="leading" spacing={3} padding={{ vertical: 4 }}>
                <Text lineLimit={2}>{commitTitle(commit.message)}</Text>
                <HStack spacing={6}>
                  <Text font="caption" foregroundStyle="tertiaryLabel">
                    {`${commit.authorLogin || commit.authorName} · ${relativeTime(commit.date)}`}
                  </Text>
                  <Spacer />
                  <Text font="caption" foregroundStyle="tertiaryLabel">
                    {commit.shortSha}
                  </Text>
                </HStack>
              </VStack>
            </NavigationLink>
          ))
        )}
      </Section>

      {hasMore ? (
        <Section>
          <Button
            title="加载更多"
            systemImage="arrow.down.circle"
            action={() => load(page + 1, false)}
          />
        </Section>
      ) : null}
    </List>
  )
}

export function CommitDetailView({
  owner,
  repo,
  sha,
}: {
  owner: string
  repo: string
  sha: string
}) {
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [error, setError] = useState<ErrorInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await getCommit(owner, repo, sha)
        if (!cancelled) setDetail(result)
      } catch (e) {
        if (!cancelled) setError(toErrorInfo(e, "加载提交详情失败"))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sha])

  const body = detail ? commitBody(detail.message) : ""

  return (
    <List navigationTitle={detail ? detail.shortSha : "Commit"} navigationBarTitleDisplayMode="inline">
      {error ? (
        <Section title={error.title}>
          <ErrorBanner info={error} />
        </Section>
      ) : null}

      {detail === null ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">正在加载…</Text>
        </Section>
      ) : (
        <Section
          header={
            <VStack alignment="leading" spacing={4}>
              <Text font="headline">{commitTitle(detail.message)}</Text>
              <Text font="footnote" foregroundStyle="secondaryLabel">
                {`${detail.authorLogin || detail.authorName} · ${relativeTime(detail.date)}`}
              </Text>
              <Text font="caption" foregroundStyle="tertiaryLabel">
                {detail.sha}
              </Text>
            </VStack>
          }
          footer={body ? <Text font="footnote">{body}</Text> : undefined}
        >
          <Button
            title="复制 commit SHA"
            systemImage="doc.on.doc"
            action={async () => {
              await Pasteboard.setString(detail.sha)
            }}
          />
          <Button
            title="在 GitHub 打开"
            systemImage="safari"
            action={async () => {
              await Safari.openURL(detail.htmlURL || `https://github.com/${owner}/${repo}/commit/${sha}`)
            }}
          />
        </Section>
      )}

      {detail ? (
        <Section
          header={<Text font="footnote" foregroundStyle="secondaryLabel">{`变更文件 · ${detail.files.length}`}</Text>}
          footer={<Hint text="点击文件查看逐行差异。" />}
        >
          {detail.files.length === 0 ? (
            <Text foregroundStyle="secondaryLabel">这次提交没有文件变更信息。</Text>
          ) : (
            detail.files.map(file => (
              <NavigationLink
                key={file.filename}
                destination={
                  <DiffView
                    filename={file.filename}
                    patch={file.patch}
                    additions={file.additions}
                    deletions={file.deletions}
                    status={file.status}
                  />
                }
              >
                <HStack spacing={8}>
                  <Image systemName="doc.text" foregroundStyle="secondaryLabel" />
                  <Text lineLimit={1}>{file.filename}</Text>
                  <Spacer />
                  <Text font="caption" foregroundStyle="systemGreen">{`+${file.additions}`}</Text>
                  <Text font="caption" foregroundStyle="systemRed">{`-${file.deletions}`}</Text>
                </HStack>
              </NavigationLink>
            ))
          )}
        </Section>
      ) : null}
    </List>
  )
}

export function DiffView({
  filename,
  patch,
  additions,
  deletions,
  status,
}: {
  filename: string
  patch: string
  additions: number
  deletions: number
  status: string
}) {
  const controller = useMemo(
    () =>
      new EditorController({
        content: patch || "（GitHub 没有返回这个文件的差异，可能是二进制文件或差异过大）",
        ext: "txt",
        readOnly: true,
      }),
    [patch]
  )

  useEffect(() => {
    return () => {
      controller.dispose()
    }
  }, [controller])

  return (
    <VStack
      navigationTitle={filename.split("/").pop() || filename}
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        topBarTrailing: (
          <Button
            title="复制"
            systemImage="doc.on.doc"
            action={async () => {
              await Pasteboard.setString(patch)
            }}
          />
        ),
      }}
    >
      <List frame={{ maxHeight: 220 }}>
        <Section
          header={
            <HStack spacing={8}>
              <Text font="footnote" lineLimit={1}>
                {filename}
              </Text>
              <Spacer />
              <Text font="caption" foregroundStyle="systemGreen">{`+${additions}`}</Text>
              <Text font="caption" foregroundStyle="systemRed">{`-${deletions}`}</Text>
            </HStack>
          }
          footer={<Hint text={`状态：${status}`} />}
        >
          <Text font="footnote" foregroundStyle="secondaryLabel">
            {`${additions} 行新增 · ${deletions} 行删除`}
          </Text>
        </Section>
      </List>
      <Editor controller={controller} searchEnabled showAccessoryView={false} />
    </VStack>
  )
}
