/**
 * 设置页：阅读 / AI / 订阅 / 缓存 / 外观 / 关于。
 * 尽量少的层级：能在这一页直接调的就不再开子页面。
 */

import {
  Button,
  HStack,
  Image,
  List,
  NavigationLink,
  NavigationStack,
  Picker,
  Section,
  Slider,
  Spacer,
  Text,
  TextField,
  Toggle,
  VStack,
  useEffect,
  useState,
} from "scripting"
import type { AppearanceMode, ImageCacheLimit, ReadMarkMode, RefreshInterval } from "../models"
import { clearImageCache, enforceImageCacheLimit, imageCacheStats } from "../lib/image_cache"
import { buildOPML, parseOPML } from "../lib/opml"
import { formatBytes } from "../lib/persist"
import { refreshAllFeeds, refreshFeed } from "../lib/refresh"
import { store, useStoreVersion } from "../lib/store"
import { parseFeed } from "../lib/feed_parser"
import { fetchText } from "../lib/refresh"
import { uid } from "../lib/utils"
import { FONT_PRESETS, fontPresetID, fontProps, settingFromPreset } from "../lib/typography"
import { usePalette } from "../theme"
import { AISettingsPage } from "./ai_settings"
import { ExitButton } from "./components"

const VERSION = "1.0.0"

export function SettingsPage({ onExit }: { onExit: () => void }) {
  useStoreVersion()
  const palette = usePalette()
  const settings = store.settings
  const [cache, setCache] = useState({ bytes: 0, files: 0 })
  const [busy, setBusy] = useState("")

  const refreshCacheStats = async () => {
    const stats = await imageCacheStats()
    setCache(stats)
  }

  useEffect(() => {
    void refreshCacheStats()
  }, [])

  const active = store.activeProvider()
  const autoSummaryLabel =
    settings.autoSummary === "off"
      ? "关闭"
      : settings.autoSummary === "favorite"
        ? "收藏时"
        : settings.autoSummary === "read"
          ? "阅读时"
          : "Wi‑Fi 下"

  const importOPML = async () => {
    setBusy("正在导入…")
    try {
      const files = await DocumentPicker.pickFiles({})
      const path = files?.[0]
      if (!path) {
        setBusy("")
        return
      }
      const text = await FileManager.readAsString(path)
      const outlines = parseOPML(text)
      if (!outlines.length) {
        setBusy("")
        await Dialog.alert({ title: "导入失败", message: "这个文件里没有找到订阅源。" })
        return
      }
      const ok = await Dialog.confirm({
        title: "导入 OPML",
        message: `发现 ${outlines.length} 个订阅源，全部导入？`,
        confirmLabel: "全部导入",
      })
      setBusy("")
      if (!ok) return
      await importOutlines(outlines, setBusy)
    } catch (error) {
      setBusy("")
      await Dialog.alert({ title: "导入失败", message: String((error as Error)?.message ?? error) })
    }
  }

  const exportOPML = async () => {
    setBusy("正在导出…")
    try {
      const opml = buildOPML(store.feeds, store.folders)
      const data = Data.fromString(opml)
      if (!data) throw new Error("无法生成文件")
      await DocumentPicker.exportFiles({
        files: [{ data, name: "lume-subscriptions.opml" }],
      })
      setBusy("")
    } catch (error) {
      setBusy("")
      await Dialog.alert({ title: "导出失败", message: String((error as Error)?.message ?? error) })
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="设置"
        navigationBarTitleDisplayMode="large"
        listStyle="insetGroup"
        toolbar={{ topBarLeading: [<ExitButton key="exit" onExit={onExit} />] }}
      >
        {/* 阅读 */}
        <Section title="阅读">
          <Picker
            value={settings.readingMode as string}
            onChanged={(value: string) =>
              store.updateSettings({ readingMode: value === "original" ? "original" : "reader" })
            }
            pickerStyle="inline"
            label={<Text>阅读模式</Text>}
          >
            <Text tag="reader">阅读模式</Text>
            <Text tag="original">原文模式</Text>
          </Picker>
          <VStack alignment="leading" spacing={2} padding={{ vertical: 4 }}>
            <HStack>
              <Text font={16}>字体大小</Text>
              <Spacer />
              <Text font={14} foregroundStyle={palette.secondary}>
                {settings.fontSize} pt
              </Text>
            </HStack>
            <Slider
              min={14}
              max={24}
              step={1}
              value={settings.fontSize}
              onChanged={(value: number) => store.updateSettings({ fontSize: Math.round(value) })}
            />
          </VStack>
          <VStack alignment="leading" spacing={2} padding={{ vertical: 4 }}>
            <HStack>
              <Text font={16}>行距</Text>
              <Spacer />
              <Text font={14} foregroundStyle={palette.secondary}>
                {settings.lineSpacing.toFixed(2)}
              </Text>
            </HStack>
            <Slider
              min={1.2}
              max={2}
              step={0.05}
              value={settings.lineSpacing}
              onChanged={(value: number) => store.updateSettings({ lineSpacing: value })}
            />
          </VStack>
          <Picker
            value={settings.markReadMode as string}
            onChanged={(value: string) =>
              store.updateSettings({ markReadMode: value === "open" ? "open" : ("progress" as ReadMarkMode) })
            }
            pickerStyle="inline"
            label={<Text>自动标记已读</Text>}
          >
            <Text tag="progress">阅读超过 {settings.markReadThreshold}% 后标记</Text>
            <Text tag="open">打开文章立即标记</Text>
          </Picker>
          <Toggle
            title="显示阅读进度"
            value={settings.showReadingProgress}
            onChanged={(value: boolean) => store.updateSettings({ showReadingProgress: value })}
          />
        </Section>

        {/* AI */}
        <Section title="AI">
          <NavigationLink destination={<AISettingsPage />}>
            <HStack>
              <Text font={16}>AI Provider</Text>
              <Spacer />
              <Text font={14} foregroundStyle={palette.secondary}>
                {active ? active.name : "未配置"}
              </Text>
            </HStack>
          </NavigationLink>
          <HStack>
            <Text font={16}>默认模型</Text>
            <Spacer />
            <Text font={14} foregroundStyle={palette.secondary}>
              {active?.model || "—"}
            </Text>
          </HStack>
          <NavigationLink destination={<AISettingsPage />}>
            <HStack>
              <Text font={16}>自动总结</Text>
              <Spacer />
              <Text font={14} foregroundStyle={palette.secondary}>
                {autoSummaryLabel}
              </Text>
            </HStack>
          </NavigationLink>
          <NavigationLink destination={<AISettingsPage />}>
            <HStack>
              <Text font={16}>AI 数据</Text>
              <Spacer />
              <Text font={14} foregroundStyle={palette.secondary}>
                {store.articles.filter((a) => !!a.aiSummary).length} 篇摘要
              </Text>
            </HStack>
          </NavigationLink>
        </Section>

        {/* 订阅 */}
        <Section
          header={<Text font={15}>订阅</Text>}
          footer={<Text font={12}>Lume 不运行常驻后台轮询，只在打开 App 或你下拉刷新时更新。</Text>}
        >
          <Picker
            value={settings.refreshInterval as string}
            onChanged={(value: string) => store.updateSettings({ refreshInterval: value as RefreshInterval })}
            pickerStyle="inline"
            label={<Text>默认刷新方式</Text>}
          >
            <Text tag="manual">手动</Text>
            <Text tag="30m">每 30 分钟</Text>
            <Text tag="1h">每小时</Text>
            <Text tag="3h">每 3 小时</Text>
            <Text tag="6h">每 6 小时</Text>
          </Picker>
          <Toggle
            title="抓取完整正文"
            value={settings.fetchFullContent}
            onChanged={(value: boolean) => store.updateSettings({ fetchFullContent: value })}
          />
          <Button title="立即刷新全部订阅" action={() => void refreshAllFeeds()} disabled={store.refreshing} />
        </Section>

        {/* 数据 */}
        <Section header={<Text font={15}>导入 / 导出</Text>} footer={<Text font={12}>支持 RSS、Atom 与 OPML。</Text>}>
          <Button title={busy === "正在导入…" ? "正在导入…" : "导入 OPML"} action={() => void importOPML()} disabled={!!busy} />
          <Button title={busy === "正在导出…" ? "正在导出…" : "导出 OPML"} action={() => void exportOPML()} disabled={!!busy} />
        </Section>

        {/* 缓存 */}
        <Section title="缓存">
          <Picker
            value={String(settings.imageCacheLimit)}
            onChanged={(value: string) => {
              const limit = Number(value) as ImageCacheLimit
              store.updateSettings({ imageCacheLimit: limit })
              void enforceImageCacheLimit(limit)
            }}
            pickerStyle="inline"
            label={<Text>图片缓存</Text>}
          >
            <Text tag="0">自动（500 MB）</Text>
            <Text tag="500">500 MB</Text>
            <Text tag="1024">1 GB</Text>
            <Text tag="2048">2 GB</Text>
            <Text tag="-1">不限制</Text>
          </Picker>
          <HStack>
            <Text font={16}>已占用</Text>
            <Spacer />
            <Text font={14} foregroundStyle={palette.secondary}>
              {formatBytes(cache.bytes)} · {cache.files} 个文件
            </Text>
          </HStack>
          <Button
            title="清理缓存"
            role="destructive"
            action={() => {
              void (async () => {
                const ok = await Dialog.confirm({
                  title: "清理缓存",
                  message: "会删除已下载的图片（收藏文章再次打开时会重新下载）。",
                  confirmLabel: "清理",
                })
                if (!ok) return
                await clearImageCache()
                store.dropCaches()
                await refreshCacheStats()
              })()
            }}
          />
          <Toggle
            title="离线阅读"
            value={settings.offlineReading}
            onChanged={(value: boolean) => store.updateSettings({ offlineReading: value })}
          />
        </Section>

        {/* 外观 */}
        <Section title="外观">
          <Picker
            value={settings.appearance as string}
            onChanged={(value: string) => store.updateSettings({ appearance: value as AppearanceMode })}
            pickerStyle="inline"
            label={<Text>主题</Text>}
          >
            <Text tag="system">跟随系统</Text>
            <Text tag="light">浅色</Text>
            <Text tag="dark">深色</Text>
          </Picker>
          <Button
            title="App 图标"
            action={() =>
              void Dialog.alert({
                title: "App 图标",
                message: "Lume 的图标跟随脚本自身的图标设置，可以在 Scripting 的脚本信息里更换。",
              })
            }
          />
        </Section>

        {/* 字体 */}
        <FontSettingsSection />

        {/* 关于 */}
        <Section title="关于">
          <HStack>
            <Text font={16}>版本</Text>
            <Spacer />
            <Text font={14} foregroundStyle={palette.secondary}>
              {VERSION}
            </Text>
          </HStack>
          <Button
            title="开源许可"
            action={() =>
              void Dialog.alert({
                title: "开源许可",
                message:
                  "Lume RSS 的解析、提取与渲染全部由脚本自身实现，未引入第三方库。阅读体验借鉴了 Reeder、Apple News 与 Things 的设计理念。",
              })
            }
          />
          <Button
            title="隐私"
            action={() =>
              void Dialog.alert({
                title: "隐私",
                message:
                  "所有订阅、文章、阅读状态与图片都只保存在本机。API Key 保存在系统 Keychain。只有在你自己点击 AI 总结（或显式开启自动总结）时，文章内容才会发送到你配置的 AI 服务商。",
              })
            }
          />
        </Section>

        <Section>
          <HStack spacing={10}>
            <Image systemName="leaf" font={15} foregroundStyle={palette.tertiary} />
            <Text font={13} foregroundStyle={palette.tertiary}>
              RSS 负责发现内容，Lume 负责把内容变得好读。
            </Text>
          </HStack>
        </Section>
      </List>
    </NavigationStack>
  )
}

// ── 字体设置 ────────────────────────────────────────────────
// 单独抽成组件：设置页里直接用，也方便 dev/preview_fonts.tsx 单独截图检查。

export function FontSettingsSection() {
  useStoreVersion()
  const palette = usePalette()
  const settings = store.settings

  const fontPicker = (
    label: string,
    current: typeof settings.titleFont,
    onPick: (value: typeof settings.titleFont) => void
  ) => (
    <Picker value={fontPresetID(current)} onChanged={(value: string) => onPick(settingFromPreset(value, current))} pickerStyle="menu" label={<Text>{label}</Text>}>
      {FONT_PRESETS.map((preset) => (
        <Text key={preset.id} tag={preset.id}>
          {preset.label}
        </Text>
      ))}
    </Picker>
  )

  return (
    <Section
      header={<Text font={15}>字体</Text>}
      footer={
        <Text font={12}>
          预设的前四项是系统内置变体（一定生效）；下面也可以直接填系统字体名（PostScript / family
          名），例如 PingFangSC-Regular、Songti SC。名字不存在时会静默回退到系统字体。
        </Text>
      }
    >
      {fontPicker("标题字体", settings.titleFont, (value) => store.updateSettings({ titleFont: value }))}
      <TextField
        title="标题字体名"
        value={settings.titleFont.family}
        onChanged={(value: string) => store.updateSettings({ titleFont: { ...settings.titleFont, family: value } })}
        prompt="字体名（留空用系统字体）"
        autocorrectionDisabled
        textInputAutocapitalization="never"
      />
      {fontPicker("正文字体", settings.bodyFont, (value) => store.updateSettings({ bodyFont: value }))}
      <TextField
        title="正文字体名"
        value={settings.bodyFont.family}
        onChanged={(value: string) => store.updateSettings({ bodyFont: { ...settings.bodyFont, family: value } })}
        prompt="字体名（留空用系统字体）"
        autocorrectionDisabled
        textInputAutocapitalization="never"
      />
      <VStack alignment="leading" spacing={8} padding={{ vertical: 8 }}>
        <Text {...fontProps(settings.titleFont, 21)} fontWeight="semibold" foregroundStyle={palette.label}>
          标题预览：Lume 让 RSS 更好读
        </Text>
        <Text
          {...fontProps(settings.bodyFont, settings.fontSize)}
          lineSpacing={settings.lineSpacing}
          foregroundStyle={palette.secondary}
        >
          RSS 负责发现内容，Lume 负责把内容变得好读。这是一段正文字体的预览文字 Aa 123。
        </Text>
      </VStack>
    </Section>
  )
}

// ── OPML 导入实现 ────────────────────────────────────────────

async function importOutlines(
  outlines: Array<{ title: string; url: string; siteURL?: string; folder?: string }>,
  setBusy: (value: string) => void
) {
  let done = 0
  for (const outline of outlines) {
    try {
      setBusy(`正在导入 ${done + 1} / ${outlines.length}…`)
      if (store.feeds.some((feed) => feed.url === outline.url)) {
        done++
        continue
      }
      const result = await fetchText(outline.url, { timeout: 15000 })
      const parsed = parseFeed(result.text, outline.url)
      let folderID: string | undefined
      if (outline.folder) {
        const existing = store.folders.find((folder) => folder.name === outline.folder)
        folderID = existing ? existing.id : store.addFolder(outline.folder).id
      }
      const feed = {
        id: uid("feed-"),
        title: outline.title || parsed.meta.title,
        url: outline.url,
        siteURL: outline.siteURL || parsed.meta.siteURL,
        description: parsed.meta.description,
        iconURL: parsed.meta.iconURL,
        folderID,
        unreadCount: 0,
        isMuted: false,
        sortOrder: store.feeds.length,
        feedType: parsed.meta.feedType,
      }
      const saved = store.addFeedData(feed)
      await refreshFeed(saved.id, { limit: 60 })
    } catch {
      // 单个源失败不影响整体导入
    }
    done++
  }
  setBusy("")
  await store.flush()
  await Dialog.alert({ title: "导入完成", message: `已处理 ${done} 个订阅源。` })
}
