/** Tab 4：设置（§30） */

import {
  HStack,
  Image,
  List,
  NavigationLink,
  NavigationStack,
  Section,
  Text,
  Toggle,
  VStack,
} from "scripting"
import { getAccount, listAccounts } from "../api/auth"
import { cacheStatsForActiveAccount } from "../services/cache"
import { draftsSummary } from "../services/drafts"
import { getSettings, updateSettings } from "../services/store"
import { emitters } from "../utils/emitter"
import { useWatch } from "../utils/hooks"
import { relativeTime, durationLabel } from "../utils/format"
import {
  AboutView,
  AppearanceSettingsView,
  CacheSettingsView,
  EditorSettingsView,
  GithubAccountView,
  NetworkSettingsView,
} from "./SettingsPages"
import { ExitAppButton, Hint, SettingsRow } from "./components"

export function SettingsTab() {
  useWatch(emitters.settings, emitters.account, emitters.drafts)
  const settings = getSettings()
  const account = getAccount()
  const accounts = listAccounts()
  const cache = cacheStatsForActiveAccount()
  const drafts = draftsSummary()

  const textSizeLabel: Record<string, string> = {
    small: "小",
    medium: "标准",
    large: "大",
    xLarge: "特大",
    xxLarge: "巨大",
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="设置"
        toolbar={{ topBarLeading: <ExitAppButton /> }}
      >
        <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">GitHub</Text>}>
          <NavigationLink destination={<GithubAccountView />}>
            <SettingsRow
              icon="person.crop.circle"
              title={account ? `@${account.login}` : "未登录"}
              subtitle={
                account
                  ? accounts.length > 1
                    ? `${accounts.length} 个账户 · 上次验证 ${relativeTime(account.lastVerified)}`
                    : `上次验证 ${relativeTime(account.lastVerified)}`
                  : "点这里添加访问令牌"
              }
            />
          </NavigationLink>
        </Section>

        <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">编辑器</Text>}>
          <NavigationLink destination={<EditorSettingsView />}>
            <SettingsRow
              icon="square.and.pencil"
              tint="systemPurple"
              title="编辑器"
              subtitle={`文字 ${textSizeLabel[settings.editorTextSize] || settings.editorTextSize} · Tab ${settings.tabWidth} 空格 · 草稿自动保存${settings.autoSaveDraft ? "开" : "关"}`}
            />
          </NavigationLink>
        </Section>

        <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">外观</Text>}>
          <NavigationLink destination={<AppearanceSettingsView />}>
            <SettingsRow
              icon="circle.lefthalf.filled"
              tint="systemIndigo"
              title="外观"
              subtitle={
                settings.appearance === "system"
                  ? "跟随系统"
                  : settings.appearance === "light"
                    ? "浅色"
                    : "深色"
              }
            />
          </NavigationLink>
        </Section>

        <Section
          header={<Text font="footnote" foregroundStyle="secondaryLabel">列表</Text>}
          footer={
            <Hint text="关掉后仓库页不再显示「最近访问」快捷区。浏览记录仍然保留，随时可以再打开。" />
          }
        >
          <Toggle
            title="显示「最近访问」"
            value={settings.showRecentRepositories}
            onChanged={value => updateSettings({ showRecentRepositories: value })}
          />
        </Section>

        <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">数据</Text>}>
          <NavigationLink destination={<CacheSettingsView />}>
            <SettingsRow
              icon="internaldrive"
              tint="systemTeal"
              title="缓存与草稿"
              subtitle={`${cache.entries} 项缓存 · ${cache.text} · 有效期 ${durationLabel(settings.cacheTTLMinutes)}${drafts.pending > 0 ? ` · ${drafts.pending} 个未同步草稿` : ""}`}
            />
          </NavigationLink>
          <NavigationLink destination={<NetworkSettingsView />}>
            <SettingsRow
              icon="antenna.radiowaves.left.and.right"
              tint="systemOrange"
              title="网络"
              subtitle={`超时 ${settings.requestTimeout} 秒`}
            />
          </NavigationLink>
        </Section>

        <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">关于</Text>}>
          <NavigationLink destination={<AboutView />}>
            <SettingsRow
              icon="info.circle"
              tint="secondaryLabel"
              title="关于 Git Workbench"
              subtitle="版本 1.0.0"
            />
          </NavigationLink>
        </Section>
      </List>
    </NavigationStack>
  )
}
