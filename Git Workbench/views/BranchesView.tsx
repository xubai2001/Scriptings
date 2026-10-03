/** 分支：选择器（sheet）与分支管理页（§12） */

import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  Picker,
  Section,
  Spacer,
  Text,
  TextField,
  VStack,
  useEffect,
  useObservable,
  useState,
} from "scripting"
import { Branch } from "../types"
import { createBranch, deleteBranch, getBranchSha, listBranches } from "../api/repos"
import { recordActivity } from "../services/activity"
import { cacheRemove, cacheKeys } from "../services/cache"
import { emitters } from "../utils/emitter"
import { ErrorInfo, toErrorInfo } from "../utils/errors"
import { ErrorBanner, Hint } from "./components"

/* ------------------------------------------------------------ 选择分支 */

export function BranchPickerSheet({
  owner,
  repo,
  branches,
  current,
  defaultBranch,
}: {
  owner: string
  repo: string
  branches: Branch[]
  current: string
  defaultBranch: string
}) {
  const dismiss = Navigation.useDismiss()
  const query = useObservable("")
  const [list, setList] = useState<Branch[]>(branches)
  const [error, setError] = useState<ErrorInfo | null>(null)
  const keyword = (query.value || "").toLowerCase()
  const filtered = keyword
    ? list.filter(branch => branch.name.toLowerCase().indexOf(keyword) !== -1)
    : list

  return (
    <NavigationStack>
      <List
        navigationTitle="选择分支"
        navigationBarTitleDisplayMode="inline"
        searchable={{ value: query, prompt: "搜索分支" }}
        toolbar={{
          cancellationAction: <Button title="取消" action={() => dismiss(null)} />,
          confirmationAction: (
            <Button
              title="新建"
              systemImage="plus"
              action={async () => {
                const created = await Navigation.present<string | null>(
                  <CreateBranchSheet
                    owner={owner}
                    repo={repo}
                    branches={list}
                    defaultBranch={defaultBranch}
                  />
                )
                if (created) {
                  const fresh = await listBranches(owner, repo).catch(() => null)
                  if (fresh) setList(fresh)
                  dismiss(created)
                }
              }}
            />
          ),
        }}
      >
        {error ? (
          <Section title="操作失败">
            <ErrorBanner info={error} onDismiss={() => setError(null)} />
          </Section>
        ) : null}
        <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">{`共 ${list.length} 个分支`}</Text>}>
          {filtered.map(branch => (
            <Button
              key={branch.name}
              buttonStyle="plain"
              action={() => dismiss(branch.name)}
            >
              <HStack spacing={10}>
                <Image
                  systemName={branch.name === current ? "checkmark" : "arrow.triangle.branch"}
                  foregroundStyle={branch.name === current ? "systemBlue" : "secondaryLabel"}
                />
                <VStack alignment="leading" spacing={2}>
                  <Text lineLimit={1}>{branch.name}</Text>
                  <Text font="caption" foregroundStyle="tertiaryLabel">
                    {branch.sha ? branch.sha.slice(0, 7) : ""}
                    {branch.name === defaultBranch ? " · 默认分支" : ""}
                  </Text>
                </VStack>
                <Spacer />
              </HStack>
            </Button>
          ))}
        </Section>
      </List>
    </NavigationStack>
  )
}

/* ------------------------------------------------------------ 新建分支 */

function CreateBranchSheet({
  owner,
  repo,
  branches,
  defaultBranch,
}: {
  owner: string
  repo: string
  branches: Branch[]
  defaultBranch: string
}) {
  const dismiss = Navigation.useDismiss()
  const [name, setName] = useState("")
  const [from, setFrom] = useState(defaultBranch)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorInfo | null>(null)

  async function submit() {
    const branchName = name.trim().replace(/\s+/g, "-")
    if (!branchName) {
      setError({
        title: "请填写分支名",
        message: "例如 feature/test。",
        detail: "",
        httpStatus: 0,
        retryable: false,
        conflict: false,
      })
      return
    }
    if (branches.some(branch => branch.name === branchName)) {
      setError({
        title: "分支已存在",
        message: `仓库里已经有 ${branchName} 了。`,
        detail: "",
        httpStatus: 0,
        retryable: false,
        conflict: false,
      })
      return
    }
    setBusy(true)
    setError(null)
    try {
      const sha = await getBranchSha(owner, repo, from)
      await createBranch(owner, repo, branchName, sha)
      recordActivity({
        kind: "repo_branch_create",
        title: "创建分支",
        subtitle: branchName,
        ok: true,
        repo: `${owner}/${repo}`,
        branch: branchName,
        detail: `基于 ${from}`,
      })
      cacheRemove(cacheKeys.branches(`${owner}/${repo}`))
      emitters.repositories.emit()
      dismiss(branchName)
    } catch (e) {
      const info = toErrorInfo(e, "创建分支失败")
      recordActivity({
        kind: "repo_branch_create",
        title: info.title,
        subtitle: branchName,
        ok: false,
        error: info.detail,
        httpStatus: info.httpStatus,
        repo: `${owner}/${repo}`,
      })
      setError(info)
    } finally {
      setBusy(false)
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="新建分支"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="取消" action={() => dismiss(null)} />,
          confirmationAction: <Button title={busy ? "创建中…" : "创建"} action={submit} disabled={busy} />,
        }}
      >
        <Section
          header={<Text font="footnote" foregroundStyle="secondaryLabel">分支信息</Text>}
          footer={<Hint text="新分支从选定的源分支最新提交开始，等价于 git branch 后 push。" />}
        >
          <TextField title="名称" prompt="feature/new-ui" value={name} onChanged={setName} autocorrectionDisabled />
          <Picker
            title="基于分支"
            value={from}
            onChanged={(value: string) => setFrom(value)}
            pickerStyle="menu"
          >
              {branches.map(branch => (
                <Text key={branch.name} tag={branch.name}>
                  {branch.name}
                </Text>
              ))}
          </Picker>
        </Section>
        {error ? (
          <Section title="创建失败">
            <ErrorBanner info={error} onRetry={submit} />
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  )
}

/* ------------------------------------------------------------ 分支管理页 */

export function BranchesListView({
  owner,
  repo,
  defaultBranch,
}: {
  owner: string
  repo: string
  defaultBranch: string
}) {
  const [branches, setBranches] = useState<Branch[] | null>(null)
  const [error, setError] = useState<ErrorInfo | null>(null)

  async function load(force = false) {
    if (force) cacheRemove(cacheKeys.branches(`${owner}/${repo}`))
    try {
      const result = await listBranches(owner, repo)
      setBranches(result)
      setError(null)
    } catch (e) {
      setError(toErrorInfo(e, "加载分支失败"))
      setBranches(prev => prev || [])
    }
  }

  useEffect(() => {
    load(false)
  }, [])

  async function remove(branch: Branch) {
    if (branch.name === defaultBranch) {
      await Dialog.alert({ title: "无法删除", message: "默认分支不能被删除。" })
      return
    }
    const ok = await Dialog.confirm({
      title: "删除分支",
      message: `确定删除 ${branch.name}？该分支之后将不再出现在仓库里。`,
      confirmLabel: "删除",
    })
    if (!ok) return
    try {
      await deleteBranch(owner, repo, branch.name)
      recordActivity({
        kind: "repo_branch_delete",
        title: "删除分支",
        subtitle: branch.name,
        ok: true,
        repo: `${owner}/${repo}`,
        branch: branch.name,
      })
      cacheRemove(cacheKeys.branches(`${owner}/${repo}`))
      emitters.repositories.emit()
      await load(true)
    } catch (e) {
      const info = toErrorInfo(e, "删除分支失败")
      recordActivity({
        kind: "repo_branch_delete",
        title: info.title,
        subtitle: branch.name,
        ok: false,
        error: info.detail,
        httpStatus: info.httpStatus,
        repo: `${owner}/${repo}`,
      })
      setError(info)
    }
  }

  return (
    <List
      navigationTitle="Branches"
      navigationBarTitleDisplayMode="inline"
      refreshable={async () => {
        await load(true)
      }}
      toolbar={{
        topBarTrailing: (
          <Button
            title="新建"
            systemImage="plus"
            action={async () => {
              const created = await Navigation.present<string | null>(
                <CreateBranchSheet
                  owner={owner}
                  repo={repo}
                  branches={branches || []}
                  defaultBranch={defaultBranch}
                />
              )
              if (created) await load(true)
            }}
          />
        ),
      }}
    >
      {error ? (
        <Section title={error.title}>
          <ErrorBanner info={error} onRetry={() => load(true)} />
        </Section>
      ) : null}
      <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">{`${branches?.length ?? 0} 个分支`}</Text>}>
        {branches === null ? (
          <Text foregroundStyle="secondaryLabel">正在加载…</Text>
        ) : (
          branches.map(branch => (
            <HStack
              key={branch.name}
              spacing={10}
              trailingSwipeActions={{
                allowsFullSwipe: false,
                actions: [
                  <Button
                    title="删除"
                    systemImage="trash"
                    role="destructive"
                    action={() => remove(branch)}
                  />,
                ],
              }}
            >
              <Image
                systemName={branch.name === defaultBranch ? "star" : "arrow.triangle.branch"}
                foregroundStyle={branch.name === defaultBranch ? "systemYellow" : "secondaryLabel"}
              />
              <VStack alignment="leading" spacing={2}>
                <Text lineLimit={1}>{branch.name}</Text>
                <Text font="caption" foregroundStyle="tertiaryLabel">
                  {branch.sha ? branch.sha.slice(0, 7) : ""}
                </Text>
              </VStack>
              <Spacer />
            </HStack>
          ))
        )}
      </Section>
      <Section
        footer={
          <Hint text="长按或左滑可以删除分支（默认分支与受保护分支无法删除）。" />
        }
      >
        <Text font="footnote" foregroundStyle="secondaryLabel">
          提示：在分支上左滑即可删除。
        </Text>
      </Section>
    </List>
  )
}
