/** 添加仓库（§6：GitHub 仓库 / 自定义 Repository URL） */

import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  Section,
  Spacer,
  Text,
  TextField,
  VStack,
  useState,
} from "scripting"
import { Repository } from "../types"
import { loadRepositoryDetail } from "../services/loaders"
import { cacheSet, cacheKeys } from "../services/cache"
import { isFavoriteRepo, toggleFavoriteRepo } from "../services/store"
import { emitters } from "../utils/emitter"
import { useWatch } from "../utils/hooks"
import { ErrorInfo, toErrorInfo } from "../utils/errors"
import { Hint, EmptyState } from "./components"
import { RepositoryRow } from "./RepositoryRow"

export function AddRepositorySheet({ known }: { known: Repository[] }) {
  const dismiss = Navigation.useDismiss()
  useWatch(emitters.favorites)
  const [owner, setOwner] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorInfo | null>(null)
  const [added, setAdded] = useState(false)

  async function addManual() {
    const o = owner.trim()
    const r = name.trim()
    if (!o || !r) {
      setError({
        title: "请填写完整",
        message: "需要 owner 和仓库名，例如 octocat / Hello-World。",
        detail: "",
        httpStatus: 0,
        retryable: false,
        conflict: false,
      })
      return
    }
    setBusy(true)
    setError(null)
    const result = await loadRepositoryDetail(o, r, true)
    setBusy(false)
    if (!result.value) {
      setError(toErrorInfo(result.error, "找不到这个仓库"))
      return
    }
    cacheSet(cacheKeys.repository(result.value.fullName), result.value)
    if (!isFavoriteRepo(result.value.fullName)) {
      toggleFavoriteRepo(result.value.fullName)
      emitters.favorites.emit()
    }
    setAdded(true)
    dismiss(result.value.fullName)
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="添加仓库"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="取消" action={() => dismiss(false)} />,
        }}
      >
        <Section
          header={<Text font="footnote" foregroundStyle="secondaryLabel">手动添加</Text>}
          footer={<Hint text="输入 owner/仓库名即可收藏任意仓库（公开仓库无需额外权限）。" />}
        >
          <TextField title="Owner" prompt="例如 xubai2001" value={owner} onChanged={setOwner} autocorrectionDisabled />
          <TextField title="Repository" prompt="例如 Scriptings" value={name} onChanged={setName} autocorrectionDisabled />
          <Button
            title={busy ? "正在验证…" : "添加并收藏"}
            systemImage="plus"
            action={addManual}
            disabled={busy}
          />
        </Section>

        {error ? (
          <Section title="添加失败">
            <VStack alignment="leading" spacing={4}>
              <Text font="headline">{error.title}</Text>
              <Text font="footnote" foregroundStyle="secondaryLabel">
                {error.message}
              </Text>
            </VStack>
          </Section>
        ) : null}

        <Section
          header={<Text font="footnote" foregroundStyle="secondaryLabel">从我的仓库中选择</Text>}
          footer={<Hint text="点一下即可加入收藏，收藏的仓库会固定显示在仓库页顶部。" />}
        >
          {known.length === 0 ? (
            <EmptyState icon="tray" title="还没有仓库列表" message="先在仓库页刷新一次，或使用手动添加。" />
          ) : (
            known.slice(0, 60).map(repo => (
              <Button
                key={repo.fullName}
                buttonStyle="plain"
                action={() => {
                  toggleFavoriteRepo(repo.fullName)
                  emitters.favorites.emit()
                }}
              >
                <HStack spacing={10}>
                  <RepositoryRow repo={repo} />
                  <Image
                    systemName={isFavoriteRepo(repo.fullName) ? "checkmark.circle.fill" : "circle"}
                    foregroundStyle={isFavoriteRepo(repo.fullName) ? "systemBlue" : "tertiaryLabel"}
                  />
                </HStack>
              </Button>
            ))
          )}
        </Section>
      </List>
    </NavigationStack>
  )
}
