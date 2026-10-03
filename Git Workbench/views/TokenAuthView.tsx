/**
 * GitHub 授权：使用个人访问令牌（PAT）。
 * 令牌只写入 Keychain，界面永远不回显完整内容。
 */

import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  Section,
  SecureField,
  Spacer,
  Text,
  VStack,
  useObservable,
  useState,
} from "scripting"
import { getViewer } from "../api/repos"
import { addAccount, updateAccount } from "../api/auth"
import { recordActivity } from "../services/activity"
import { emitters } from "../utils/emitter"
import { ErrorInfo, toErrorInfo } from "../utils/errors"
import { ErrorBanner, Hint } from "./components"

import { listAccounts } from "../api/auth"

function findExisting(login: string) {
  return listAccounts().find(account => account.login === login) || null
}

const CREATE_TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo,gist&description=Git%20Workbench"

export function TokenAuthView({ firstRun }: { firstRun?: boolean }) {
  const dismiss = Navigation.useDismiss()
  const token = useObservable("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorInfo | null>(null)

  async function verify() {
    const value = (token.value || "").trim()
    if (!value) {
      setError({
        title: "还没有填写令牌",
        message: "请先粘贴 GitHub Personal Access Token。",
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
      // 先用这个令牌验证 /user，确认有效后再落地到 Keychain
      const account = await getViewer(value)
      const existing = findExisting(account.login)
      if (existing) updateAccount(account)
      else addAccount(account, value)
      recordActivity({
        kind: "auth",
        title: existing ? "已更新账户令牌" : "已登录 GitHub",
        subtitle: `@${account.login}`,
        ok: true,
        account: account.login,
        detail: "令牌已保存到 Keychain",
      })
      emitters.account.emit()
      dismiss(true)
    } catch (e) {
      const info = toErrorInfo(e, "授权失败")
      recordActivity({
        kind: "auth",
        title: info.title,
        subtitle: "@未登录",
        ok: false,
        error: info.detail,
        httpStatus: info.httpStatus,
      })
      setError(info)
    } finally {
      setBusy(false)
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle={firstRun ? "使用 GitHub 登录" : "GitHub 账户"}
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="取消" action={() => dismiss(false)} />,
          confirmationAction: (
            <Button
              title={busy ? "验证中…" : "保存"}
              action={verify}
              disabled={busy}
            />
          ),
        }}
      >
        <Section
          header={
            <Text font="footnote" foregroundStyle="secondaryLabel">
              访问令牌
            </Text>
          }
          footer={
            <Hint text="推荐使用 Fine-grained token：仓库权限选 Contents: Read（需要提交则选 Read and write），并勾选 Gist 权限。令牌只保存在本机 Keychain，不会写入配置文件或日志。" />
          }
        >
          <SecureField
            title="Token"
            prompt="ghp_… 或 github_pat_…"
            value={token}
            autocorrectionDisabled
          />
          <Button
            title="在浏览器中创建令牌"
            systemImage="safari"
            action={async () => {
              await Safari.openURL(CREATE_TOKEN_URL)
            }}
          />
        </Section>

        <Section title="用途">
          <HStack spacing={8}>
            <Image systemName="folder" foregroundStyle="systemBlue" imageScale="small" />
            <Text>浏览仓库、目录与文件（需要 repo / Contents 读取权限）</Text>
          </HStack>
          <HStack spacing={8}>
            <Image systemName="doc.text" foregroundStyle="systemPurple" imageScale="small" />
            <Text>读取、编辑并同步你的 Gist（需要 gist 权限）</Text>
          </HStack>
        </Section>

        {error ? (
          <Section title="登录失败">
            <ErrorBanner info={error} onRetry={verify} />
          </Section>
        ) : null}

        <Section>
          <VStack alignment="leading" spacing={6}>
            <Text font="footnote" foregroundStyle="secondaryLabel">
              验证时会调用 GitHub /user 接口确认令牌有效，只读取你的公开资料。
            </Text>
            <Spacer minLength={2} />
            <Text font="footnote" foregroundStyle="secondaryLabel">
              也可以稍后在「设置 → GitHub 账户」中添加。
            </Text>
          </VStack>
        </Section>
      </List>
    </NavigationStack>
  )
}
