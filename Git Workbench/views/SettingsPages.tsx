/** 设置子页面：GitHub 账户 / 编辑器 / 外观 / 缓存 / 网络 / 关于 */

import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  Picker,
  Section,
  Spacer,
  Text,
  TextField,
  Toggle,
  VStack,
  useState,
} from "scripting"
import {
  getActiveLogin,
  listAccounts,
  maskedToken,
  removeAccount,
  switchAccount,
} from "../api/auth"
import { cacheClear, cacheClearAccount, cacheStats } from "../services/cache"
import { allDrafts, clearDrafts, draftsSummary } from "../services/drafts"
import { clearActivity, listActivity, recordActivity } from "../services/activity"
import { clearRecent, getRecent, getSettings, resetSettings, updateSettings } from "../services/store"
import { emitters } from "../utils/emitter"
import { useWatch } from "../utils/hooks"
import { dateTime, durationLabel, fileSize, relativeTime } from "../utils/format"
import { ErrorBanner, Hint, SettingsRow } from "./components"
import { TokenAuthView } from "./TokenAuthView"

/* 缓存有效期的输入：数值 + 单位，存储时统一折算成分钟（0 = 永不） */

type TTLUnit = "minute" | "hour" | "day"

const UNIT_MINUTES: Record<TTLUnit, number> = { minute: 1, hour: 60, day: 1440 }

/** 用能被整除的最大单位展示（720 → 12 小时，1440 → 1 天） */
function ttlUnitOf(minutes: number): TTLUnit {
  if (minutes > 0 && minutes % 1440 === 0) return "day"
  if (minutes > 0 && minutes % 60 === 0) return "hour"
  return "minute"
}

function ttlAmountOf(minutes: number, unit: TTLUnit): string {
  if (minutes <= 0) return ""
  return String(Math.max(1, Math.round(minutes / UNIT_MINUTES[unit])))
}

/* ------------------------------------------------------------ GitHub 账户 */

export function GithubAccountView() {
  useWatch(emitters.account)
  const active = getActiveLogin()
  const accounts = listAccounts()

  async function addAccountFlow() {
    const ok = await Navigation.present<boolean>(<TokenAuthView />)
    if (ok) emitters.account.emit()
  }

  function switchTo(login: string) {
    if (login === active) return
    if (!switchAccount(login)) return
    recordActivity({
      kind: "auth",
      title: "已切换账户",
      subtitle: `@${login}`,
      ok: true,
      account: login,
      detail: "之后的请求都使用这个账户的令牌",
    })
    emitters.account.emit()
  }

  async function remove(login: string) {
    const ok = await Dialog.confirm({
      title: `移除 @${login}？`,
      message: "该账户的访问令牌会从 Keychain 删除，它名下的浏览缓存也会清理。本地草稿不会删除。",
      confirmLabel: "移除",
    })
    if (!ok) return
    removeAccount(login)
    cacheClearAccount(login)
    emitters.account.emit()
  }

  return (
    <List navigationTitle="GitHub 账户" navigationBarTitleDisplayMode="inline">
      <Section
        header={<Text font="footnote" foregroundStyle="secondaryLabel">账户</Text>}
        footer={
          <Hint text="点击切换当前账户：仓库、Gist 与提交都使用当前账户的令牌。每个账户的浏览缓存相互独立；用同一个账户的令牌再添加一次，等于更新它的令牌。左滑可以移除账户。" />
        }
      >
        {accounts.length === 0 ? (
          <Text font="footnote" foregroundStyle="secondaryLabel">
            还没有账户，点下面的「添加账户」开始。
          </Text>
        ) : null}
        {accounts.map(account => {
          const isActive = account.login === active
          return (
            <Button
              key={account.login}
              buttonStyle="plain"
              action={() => switchTo(account.login)}
              trailingSwipeActions={{
                allowsFullSwipe: false,
                actions: [
                  <Button
                    key="remove"
                    title="移除"
                    systemImage="trash"
                    role="destructive"
                    action={() => remove(account.login)}
                  />,
                ],
              }}
            >
              <HStack spacing={12}>
                <Image
                  systemName={isActive ? "checkmark.circle.fill" : "circle"}
                  foregroundStyle={isActive ? "systemBlue" : "tertiaryLabel"}
                  font={20}
                />
                <VStack alignment="leading" spacing={3}>
                  <Text font="headline" lineLimit={1}>{`@${account.login}`}</Text>
                  <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
                    {`${account.name || "—"} · ${maskedToken(account.login)}`}
                  </Text>
                  <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
                    {`上次验证 ${relativeTime(account.lastVerified)}`}
                  </Text>
                </VStack>
                <Spacer />
                {isActive ? (
                  <Text font="caption" foregroundStyle="systemBlue">
                    当前
                  </Text>
                ) : null}
              </HStack>
            </Button>
          )
        })}
        <Button title="添加账户" systemImage="plus.circle" action={addAccountFlow} />
      </Section>

      <Section
        header={<Text font="footnote" foregroundStyle="secondaryLabel">应用权限</Text>}
        footer={
          <Hint text="Git Workbench 只使用这些权限；令牌存放在脚本独立作用域的 Keychain 中，不写入配置文件，也不会出现在日志里。" />
        }
      >
        <HStack spacing={10}>
          <Image systemName="folder" foregroundStyle="systemBlue" />
          <VStack alignment="leading" spacing={2}>
            <Text font="footnote">仓库与内容</Text>
            <Text font="caption" foregroundStyle="tertiaryLabel">
              读取仓库、目录、文件、提交、分支；提交文件时需要写权限
            </Text>
          </VStack>
        </HStack>
        <HStack spacing={10}>
          <Image systemName="doc.text" foregroundStyle="systemPurple" />
          <VStack alignment="leading" spacing={2}>
            <Text font="footnote">Gist</Text>
            <Text font="caption" foregroundStyle="tertiaryLabel">
              读取、创建、修改、删除 Gist
            </Text>
          </VStack>
        </HStack>
        <HStack spacing={10}>
          <Image systemName="person" foregroundStyle="systemTeal" />
          <VStack alignment="leading" spacing={2}>
            <Text font="footnote">用户资料</Text>
            <Text font="caption" foregroundStyle="tertiaryLabel">
              登录校验时读取 /user
            </Text>
          </VStack>
        </HStack>
      </Section>

      <Section footer={<Hint text="在 GitHub → Settings → Developer settings → Personal access tokens 中创建或撤销令牌。" />}>
        <Button
          title="打开 GitHub 令牌页面"
          systemImage="safari"
          action={async () => {
            await Safari.openURL("https://github.com/settings/tokens")
          }}
        />
      </Section>
    </List>
  )
}

/* ------------------------------------------------------------ 编辑器 */

export function EditorSettingsView() {
  useWatch(emitters.settings)
  const settings = getSettings()
  const drafts = draftsSummary()

  return (
    <List navigationTitle="编辑器" navigationBarTitleDisplayMode="inline">
      <Section
        header={<Text font="footnote" foregroundStyle="secondaryLabel">文字</Text>}
        footer={<Hint text="字号通过系统的 Dynamic Type 生效，编辑器里的代码会一起缩放。" />}
      >
        <Picker
          title="文字大小"
          value={settings.editorTextSize}
          onChanged={(value: string) =>
            updateSettings({
              editorTextSize: value as "small" | "medium" | "large" | "xLarge" | "xxLarge",
            })
          }
          pickerStyle="inline"
        >
          <Text tag="small">小</Text>
          <Text tag="medium">标准</Text>
          <Text tag="large">大</Text>
          <Text tag="xLarge">特大</Text>
          <Text tag="xxLarge">巨大</Text>
        </Picker>
      </Section>

      <Section
        header={<Text font="footnote" foregroundStyle="secondaryLabel">输入</Text>}
        footer={<Hint text="这些设置作用于编辑器键盘上方工具栏的 Tab 与回车按键。" />}
      >
        <Picker
          title="Tab 宽度"
          value={String(settings.tabWidth)}
          onChanged={(value: string) => updateSettings({ tabWidth: Number(value) || 4 })}
          pickerStyle="inline"
        >
          <Text tag="2">2 个空格</Text>
          <Text tag="4">4 个空格</Text>
          <Text tag="8">8 个空格</Text>
        </Picker>
        <Toggle
          title="自动缩进"
          value={settings.autoIndent}
          onChanged={value => updateSettings({ autoIndent: value })}
        />
        <Toggle
          title="自动保存本地草稿"
          value={settings.autoSaveDraft}
          onChanged={value => updateSettings({ autoSaveDraft: value })}
        />
      </Section>

      <Section
        header={<Text font="footnote" foregroundStyle="secondaryLabel">原生编辑器能力</Text>}
        footer={<Hint text="这些能力由系统编辑器提供，始终可用，无需设置。" />}
      >
        <HStack>
          <Text foregroundStyle="secondaryLabel">行号</Text>
          <Spacer />
          <Text>始终开启</Text>
        </HStack>
        <HStack>
          <Text foregroundStyle="secondaryLabel">语法高亮</Text>
          <Spacer />
          <Text>按文件扩展名自动选择</Text>
        </HStack>
        <HStack>
          <Text foregroundStyle="secondaryLabel">查找 / 替换</Text>
          <Spacer />
          <Text>编辑器底部按钮</Text>
        </HStack>
        <HStack>
          <Text foregroundStyle="secondaryLabel">撤销 / 重做</Text>
          <Spacer />
          <Text>编辑器右上角菜单</Text>
        </HStack>
      </Section>

      <Section
        header={<Text font="footnote" foregroundStyle="secondaryLabel">本地草稿</Text>}
        footer={<Hint text={`共 ${drafts.total} 份草稿，其中 ${drafts.pending} 份还没有同步到 GitHub。`} />}
      >
        <Text font="footnote" foregroundStyle="secondaryLabel">
          {`草稿占用约 ${fileSize(drafts.bytes)}`}
        </Text>
      </Section>
    </List>
  )
}

/* ------------------------------------------------------------ 外观 */

export function AppearanceSettingsView() {
  useWatch(emitters.settings)
  const settings = getSettings()
  return (
    <List navigationTitle="外观" navigationBarTitleDisplayMode="inline">
      <Section
        header={<Text font="footnote" foregroundStyle="secondaryLabel">主题</Text>}
        footer={<Hint text="界面颜色会立刻生效，编辑器与代码视图跟随同一设置。" />}
      >
        <Picker
          title="外观"
          value={settings.appearance}
          onChanged={(value: string) =>
            updateSettings({ appearance: value as "system" | "light" | "dark" })
          }
          pickerStyle="inline"
        >
          <Text tag="system">跟随系统</Text>
          <Text tag="light">浅色</Text>
          <Text tag="dark">深色</Text>
        </Picker>
      </Section>
      <Section footer={<Hint text="配色全部使用系统颜色（标签蓝、成功绿、警告橙、错误红），不使用固定品牌色。" />}>
        <HStack spacing={10}>
          <Image systemName="paintpalette" foregroundStyle="systemBlue" />
          <Text font="footnote">系统色调</Text>
        </HStack>
        <HStack spacing={10}>
          <Image systemName="textformat.size" foregroundStyle="systemIndigo" />
          <Text font="footnote">支持 Dynamic Type</Text>
        </HStack>
      </Section>
    </List>
  )
}

/* ------------------------------------------------------------ 缓存 */

export function CacheSettingsView() {
  useWatch(emitters.settings, emitters.drafts, emitters.activity)
  const cache = cacheStats()
  const drafts = draftsSummary()
  const recent = getRecent().length
  const activity = listActivity().length
  const [message, setMessage] = useState("")
  const settings = getSettings()
  const [ttlAmount, setTtlAmount] = useState(() =>
    ttlAmountOf(settings.cacheTTLMinutes, ttlUnitOf(settings.cacheTTLMinutes))
  )
  const [ttlUnit, setTtlUnit] = useState<TTLUnit>(() => ttlUnitOf(settings.cacheTTLMinutes))
  const neverRefresh = settings.cacheTTLMinutes <= 0

  /** 把「数值 + 单位」写成设置里的分钟数（输入过程中不写入，避免存下 0） */
  function writeTTL(amount: string, unit: TTLUnit): void {
    const value = parseInt(amount, 10)
    if (!isFinite(value) || value <= 0) return
    updateSettings({ cacheTTLMinutes: value * UNIT_MINUTES[unit] })
  }

  const pendingList = allDrafts().filter(draft => draft.state !== "synced")

  return (
    <List navigationTitle="缓存与草稿" navigationBarTitleDisplayMode="inline">
      {message ? (
        <Section>
          <Text font="footnote" foregroundStyle="systemGreen">
            {message}
          </Text>
        </Section>
      ) : null}

      <Section
        header={<Text font="footnote" foregroundStyle="secondaryLabel">当前账户缓存</Text>}
        footer={<Hint text="缓存按账户分开保存，这里的数字是当前账户的；「清除缓存」会清掉所有账户的浏览缓存（不影响草稿与账户）。" />}
      >
        <HStack>
          <Text foregroundStyle="secondaryLabel">缓存条目</Text>
          <Spacer />
          <Text>{String(cache.entries)}</Text>
        </HStack>
        <HStack>
          <Text foregroundStyle="secondaryLabel">占用空间</Text>
          <Spacer />
          <Text>{cache.text}</Text>
        </HStack>
        <Button
          title="清除缓存"
          systemImage="trash"
          role="destructive"
          action={async () => {
            const ok = await Dialog.confirm({
              title: "清除本地缓存？",
              message: "清除后离线时将看不到内容，需要重新联网加载。本地草稿不受影响。",
              confirmLabel: "清除",
            })
            if (!ok) return
            const result = cacheClear()
            setMessage(`已清除 ${result.entries} 项缓存`)
          }}
        />
      </Section>

      <Section
        header={<Text font="footnote" foregroundStyle="secondaryLabel">缓存有效期</Text>}
        footer={
          <Hint text="缓存超过这个时间后，下次打开页面会自动重新请求；在有效期内直接读本地缓存（省流量，离线也能看）。下拉刷新随时可以强制更新；保存 Gist / 提交文件后，相关缓存会立即失效。" />
        }
      >
        <TextField
          title="时长"
          prompt="例如 12"
          value={ttlAmount}
          onChanged={value => {
            setTtlAmount(value)
            writeTTL(value, ttlUnit)
          }}
          keyboardType="numberPad"
          disabled={neverRefresh}
        />
        <Picker
          title="单位"
          value={ttlUnit}
          onChanged={(value: string) => {
            const unit = value as TTLUnit
            setTtlUnit(unit)
            writeTTL(ttlAmount, unit)
          }}
          pickerStyle="inline"
          disabled={neverRefresh}
        >
          <Text tag="minute">分钟</Text>
          <Text tag="hour">小时</Text>
          <Text tag="day">天</Text>
        </Picker>
        <Toggle
          title="永不自动刷新"
          value={neverRefresh}
          onChanged={value => {
            if (value) {
              updateSettings({ cacheTTLMinutes: 0 })
              return
            }
            // 关掉「永不」时给个基准值，否则从 0 出发没有可用输入
            setTtlUnit("day")
            setTtlAmount("1")
            updateSettings({ cacheTTLMinutes: 1440 })
          }}
        />
        <HStack>
          <Text foregroundStyle="secondaryLabel">当前设置</Text>
          <Spacer />
          <Text>
            {neverRefresh
              ? "永不自动刷新（只用缓存）"
              : `缓存 ${durationLabel(settings.cacheTTLMinutes)} 后自动刷新`}
          </Text>
        </HStack>
      </Section>

      <Section
        header={<Text font="footnote" foregroundStyle="secondaryLabel">本地草稿</Text>}
        footer={
          <Hint text={`共 ${drafts.total} 份草稿，其中 ${drafts.pending} 份尚未同步到 GitHub。删除草稿会丢失未上传的修改。`} />
        }
      >
        {pendingList.slice(0, 8).map(draft => (
          <HStack key={`${draft.targetID}:${draft.filename}`} spacing={10}>
            <Image systemName="circle.dashed" foregroundStyle="systemOrange" imageScale="small" />
            <VStack alignment="leading" spacing={2}>
              <Text font="footnote" lineLimit={1}>
                {draft.filename}
              </Text>
              <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
                {`${draft.targetID} · ${relativeTime(draft.updatedAt)}`}
              </Text>
            </VStack>
            <Spacer />
          </HStack>
        ))}
        {pendingList.length === 0 ? (
          <Text font="footnote" foregroundStyle="secondaryLabel">
            没有未同步的草稿。
          </Text>
        ) : null}
        <Button
          title="清除全部草稿"
          systemImage="trash"
          role="destructive"
          action={async () => {
            const ok = await Dialog.confirm({
              title: "清除全部草稿？",
              message: "未同步的本地修改将永久丢失。",
              confirmLabel: "清除",
            })
            if (!ok) return
            clearDrafts()
            setMessage("已清除全部草稿")
          }}
        />
      </Section>

      <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">其它记录</Text>}>
        <HStack>
          <Text foregroundStyle="secondaryLabel">最近访问</Text>
          <Spacer />
          <Text>{`${recent} 条`}</Text>
        </HStack>
        <Button
          title="清除最近访问"
          systemImage="clock.badge.xmark"
          action={() => {
            clearRecent()
            setMessage("已清除最近访问")
          }}
        />
        <HStack>
          <Text foregroundStyle="secondaryLabel">活动记录</Text>
          <Spacer />
          <Text>{`${activity} 条`}</Text>
        </HStack>
        <Button
          title="清除活动记录"
          systemImage="clock.badge.xmark"
          action={() => {
            clearActivity()
            setMessage("已清除活动记录")
          }}
        />
      </Section>

      <Section>
        <Button
          title="恢复默认设置"
          systemImage="arrow.counterclockwise"
          role="destructive"
          action={async () => {
            const ok = await Dialog.confirm({
              title: "恢复默认设置？",
              message: "只会重置编辑器、外观与网络设置，不会删除账户与缓存。",
              confirmLabel: "恢复",
            })
            if (!ok) return
            resetSettings()
            setMessage("已恢复默认设置")
          }}
        />
      </Section>
    </List>
  )
}

/* ------------------------------------------------------------ 网络 */

export function NetworkSettingsView() {
  useWatch(emitters.settings)
  const settings = getSettings()
  return (
    <List navigationTitle="网络" navigationBarTitleDisplayMode="inline">
      <Section
        header={<Text font="footnote" foregroundStyle="secondaryLabel">请求</Text>}
        footer={<Hint text="超时后会自动重试两次（间隔递增），仍然失败才提示错误。" />}
      >
        <Picker
          title="请求超时"
          value={String(settings.requestTimeout)}
          onChanged={(value: string) => updateSettings({ requestTimeout: Number(value) || 25 })}
          pickerStyle="inline"
        >
          <Text tag="10">10 秒</Text>
          <Text tag="25">25 秒</Text>
          <Text tag="60">60 秒</Text>
        </Picker>
      </Section>

      <Section
        header={<Text font="footnote" foregroundStyle="secondaryLabel">预览</Text>}
        footer={<Hint text="超过上限的文件默认不加载编辑器，可以查看原始内容或下载。" />}
      >
        <Picker
          title="代码预览大小上限"
          value={String(settings.maxPreviewBytes)}
          onChanged={(value: string) => updateSettings({ maxPreviewBytes: Number(value) })}
          pickerStyle="inline"
        >
          <Text tag="262144">256 KB</Text>
          <Text tag="524288">512 KB</Text>
          <Text tag="1048576">1 MB</Text>
          <Text tag="2097152">2 MB</Text>
        </Picker>
      </Section>

      <Section
        header={<Text font="footnote" foregroundStyle="secondaryLabel">提交身份</Text>}
        footer={<Hint text="留空时使用 GitHub 账户默认身份。填写后会作为 commit 的 author 与 committer。" />}
      >
        <TextField
          title="Name"
          prompt="你的名字"
          value={settings.committerName}
          onChanged={value => updateSettings({ committerName: value })}
        />
        <TextField
          title="Email"
          prompt="you@example.com"
          value={settings.committerEmail}
          onChanged={value => updateSettings({ committerEmail: value })}
        />
      </Section>
    </List>
  )
}

/* ------------------------------------------------------------ 关于 */

export function AboutView() {
  return (
    <List navigationTitle="关于" navigationBarTitleDisplayMode="inline">
      <Section
        header={
          <VStack alignment="leading" spacing={6}>
            <Image
              systemName="chevron.left.forwardslash.chevron.right"
              font={38}
              foregroundStyle="systemBlue"
            />
            <Text font="headline">Git Workbench</Text>
            <Text font="footnote" foregroundStyle="secondaryLabel">
              GitHub 文件管理器 + Gist 编辑器 + 轻量 Git 客户端
            </Text>
          </VStack>
        }
      >
        <HStack>
          <Text foregroundStyle="secondaryLabel">版本</Text>
          <Spacer />
          <Text>1.0.0</Text>
        </HStack>
        <HStack>
          <Text foregroundStyle="secondaryLabel">运行环境</Text>
          <Spacer />
          <Text>Scripting for iOS</Text>
        </HStack>
      </Section>

      <Section
        header={<Text font="footnote" foregroundStyle="secondaryLabel">实现说明</Text>}
        footer={
          <Hint text="Git Workbench 不做本地 clone，也不伪装 Git 操作：所有写操作都是真实的 GitHub API 调用。" />
        }
      >
        <HStack spacing={10}>
          <Image systemName="network" foregroundStyle="systemBlue" />
          <Text font="footnote">GitHub REST API（Contents / Git Data / Gist）</Text>
        </HStack>
        <HStack spacing={10}>
          <Image systemName="square.and.pencil" foregroundStyle="systemPurple" />
          <Text font="footnote">系统原生代码编辑器（语法高亮 / 查找）</Text>
        </HStack>
        <HStack spacing={10}>
          <Image systemName="lock.shield" foregroundStyle="systemGreen" />
          <Text font="footnote">令牌保存在 Keychain，缓存在脚本私有域</Text>
        </HStack>
      </Section>

      <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">链接</Text>}>
        <Button
          title="GitHub REST API 文档"
          systemImage="safari"
          action={async () => {
            await Safari.openURL("https://docs.github.com/rest")
          }}
        />
        <Button
          title="创建访问令牌"
          systemImage="key"
          action={async () => {
            await Safari.openURL("https://github.com/settings/tokens")
          }}
        />
      </Section>
    </List>
  )
}
