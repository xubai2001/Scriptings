/** 复用的界面零件：状态标记、空状态、错误横幅、列表行样式 */

import {
  Button,
  HStack,
  Image,
  Navigation,
  Spacer,
  Text,
  VStack,
} from "scripting"
import type { Color } from "scripting"
import { requestExit } from "../services/lifecycle"
import { ErrorInfo } from "../utils/errors"
import { SyncState } from "../types"

/** 左上角退出按钮：关闭整个脚本页面（不会关掉 Scripting 本身） */
export function ExitAppButton() {
  const dismiss = Navigation.useDismiss()
  return (
    <Button action={() => requestExit(dismiss)}>
      <Image systemName="xmark" />
    </Button>
  )
}

/** 同步状态标记（§45：状态直接显示在页面上，不依赖 Toast） */
export function SyncBadge({ state, error }: { state: SyncState; error?: string }) {
  const config: Record<SyncState, { icon: string; label: string; color: Color }> = {
    synced: { icon: "checkmark.circle.fill", label: "已同步", color: "systemGreen" },
    local: { icon: "circle.dashed", label: "本地修改", color: "systemOrange" },
    syncing: { icon: "arrow.triangle.2.circlepath", label: "同步中", color: "systemBlue" },
    failed: { icon: "exclamationmark.triangle.fill", label: "同步失败", color: "systemRed" },
    conflict: { icon: "arrow.triangle.branch", label: "远程已修改", color: "systemOrange" },
  }
  const item = config[state]
  return (
    <HStack spacing={6}>
      <Image systemName={item.icon} foregroundStyle={item.color} imageScale="small" />
      <Text font="footnote" foregroundStyle={item.color}>
        {item.label}
      </Text>
      {error ? (
        <Text font="footnote" foregroundStyle="tertiaryLabel" lineLimit={1}>
          {error}
        </Text>
      ) : null}
    </HStack>
  )
}

/** 空状态 */
export function EmptyState({
  icon,
  title,
  message,
}: {
  icon: string
  title: string
  message?: string
}) {
  return (
    <VStack spacing={8} padding={{ vertical: 28 }}>
      <Image systemName={icon} font={34} foregroundStyle="tertiaryLabel" />
      <Text font="headline">{title}</Text>
      {message ? (
        <Text font="footnote" foregroundStyle="secondaryLabel" multilineTextAlignment="center">
          {message}
        </Text>
      ) : null}
    </VStack>
  )
}

/** 错误横幅：用户看得懂的话 + 可展开的技术细节 + 重试 */
export function ErrorBanner({
  info,
  onRetry,
  onDismiss,
}: {
  info: ErrorInfo
  onRetry?: () => void
  onDismiss?: () => void
}) {
  return (
    <VStack alignment="leading" spacing={8}>
      <HStack spacing={8}>
        <Image systemName="exclamationmark.triangle.fill" foregroundStyle="systemRed" />
        <VStack alignment="leading" spacing={2}>
          <Text font="headline">{info.title}</Text>
          <Text font="footnote" foregroundStyle="secondaryLabel">
            {info.message}
          </Text>
        </VStack>
      </HStack>
      {info.detail ? (
        <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={3}>
          {info.detail}
        </Text>
      ) : null}
      <HStack spacing={12}>
        {onRetry ? (
          <Button title="重试" action={onRetry} buttonStyle="bordered" />
        ) : null}
        {onDismiss ? (
          <Button title="知道了" action={onDismiss} buttonStyle="borderless" />
        ) : null}
      </HStack>
    </VStack>
  )
}

/** 离线提示：当前显示的是缓存内容（§27） */
export function OfflineHint({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <HStack spacing={8}>
      <Image systemName="wifi.slash" imageScale="small" foregroundStyle="systemOrange" />
      <Text font="footnote" foregroundStyle="secondaryLabel">
        离线：当前显示的是缓存内容。
      </Text>
    </HStack>
  )
}

/** 设置行的通用外观 */
export function SettingsRow({
  icon,
  tint,
  title,
  subtitle,
}: {
  icon: string
  tint?: Color
  title: string
  subtitle?: string
}) {
  return (
    <HStack spacing={10}>
      <Image systemName={icon} foregroundStyle={tint || "systemBlue"} />
      <VStack alignment="leading" spacing={2}>
        <Text lineLimit={1}>{title}</Text>
        {subtitle ? (
          <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
            {subtitle}
          </Text>
        ) : null}
      </VStack>
      <Spacer />
    </HStack>
  )
}

/** 键值行（详情页的元数据） */
export function MetaRow({
  label,
  value,
  icon,
  tint,
}: {
  label: string
  value: string
  icon?: string
  tint?: Color
}) {
  return (
    <HStack spacing={8}>
      {icon ? <Image systemName={icon} foregroundStyle={tint || "secondaryLabel"} imageScale="small" /> : null}
      <Text foregroundStyle="secondaryLabel">{label}</Text>
      <Spacer />
      <Text lineLimit={1}>{value}</Text>
    </HStack>
  )
}

/** 顶部说明文字（Section footer 常用） */
export function Hint({ text }: { text: string }) {
  return (
    <Text font="footnote" foregroundStyle="secondaryLabel">
      {text}
    </Text>
  )
}

