/**
 * AI 设置：Provider（DeepSeek / OpenAI / 自定义）、默认模型、生成设置、
 * 自动总结、隐私提示、测试连接、AI 数据清理。
 *
 * 底层统一使用 OpenAI Compatible API —— DeepSeek 只是内置的专门入口。
 */

import {
  Button,
  Group,
  HStack,
  Image,
  List,
  NavigationLink,
  NavigationStack,
  Picker,
  Section,
  Slider,
  Spacer,
  Stepper,
  Text,
  TextField,
  Toggle,
  VStack,
  useState,
} from "scripting"
import { Navigation } from "scripting"
import type { AIProvider, AIProviderType, AutoSummaryMode, SummaryLanguage, SummaryLength } from "../models"
import { DEEPSEEK_MODELS, providerTemplate } from "../models"
import { testProvider } from "../lib/ai"
import { store, useStoreVersion } from "../lib/store"
import { usePalette } from "../theme"

const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"]

function modelsFor(type: AIProviderType): string[] {
  if (type === "deepseek") return DEEPSEEK_MODELS
  if (type === "openai") return OPENAI_MODELS
  return []
}

function summaryLengthLabel(value: SummaryLength): string {
  return value === "short" ? "短" : value === "medium" ? "中" : "长"
}

export function AISettingsPage({ presented = false }: { presented?: boolean }) {
  useStoreVersion()
  const palette = usePalette()
  const dismiss = Navigation.useDismiss()
  const settings = store.settings
  const acknowledged = store.privacyAcknowledged
  const active = store.activeProvider()
  const models = active ? modelsFor(active.type) : []
  const cachedCount = store.articles.filter((a) => !!a.aiSummary).length

  const updateProvider = (patch: Partial<AIProvider>) => {
    if (!active) return
    store.upsertProvider({ ...active, ...patch })
  }

  const list = (
    <List
      navigationTitle="AI"
      navigationBarTitleDisplayMode="inline"
      listStyle="insetGroup"
      toolbar={
        presented
          ? {
              topBarTrailing: <Button title="完成" action={() => dismiss()} />,
            }
          : undefined
      }
    >
      {!acknowledged ? (
        <Section>
          <VStack alignment="leading" spacing={10} padding={{ vertical: 6 }}>
            <HStack spacing={8}>
              <Image systemName="lock.shield" font={15} foregroundStyle={palette.accent} />
              <Text font={15} fontWeight="semibold" foregroundStyle={palette.label}>
                AI 隐私
              </Text>
            </HStack>
            <Text font={13} foregroundStyle={palette.secondary} lineSpacing={3}>
              启用 AI 总结后，文章内容可能会发送到你配置的 AI 服务商。Lume 不会上传你的 API Key 到 Lume
              服务器，API Key 只保存在本机的 Keychain 里。
            </Text>
            <Button title="知道了" buttonStyle="bordered" action={() => store.acknowledgePrivacy()} />
          </VStack>
        </Section>
      ) : null}

      <Section title="Provider">
        {store.providers.map((provider) => (
          <NavigationLink key={provider.id} destination={<ProviderEditPage providerID={provider.id} />}>
            <HStack spacing={10}>
              <VStack alignment="leading" spacing={2}>
                <Text font={16} foregroundStyle={palette.label}>
                  {provider.name}
                </Text>
                <Text font={12} foregroundStyle={palette.tertiary}>
                  {provider.model || "未填写模型"}
                  {provider.apiKey ? "" : " · 未配置 Key"}
                </Text>
              </VStack>
              <Spacer />
              {provider.id === active?.id ? (
                <Image systemName="checkmark" font={14} foregroundStyle={palette.accent} />
              ) : null}
            </HStack>
          </NavigationLink>
        ))}
        <Button
          title="设为默认 Provider"
          systemImage="arrow.up.circle"
          action={() => {
            if (active) {
              store.updateSettings({ activeProviderID: active.id, defaultModel: active.model })
            }
          }}
          disabled={!active}
        />
      </Section>

      {active ? (
        <Section title="默认模型">
          {models.length ? (
            <Picker
              value={active.model}
              onChanged={(value: string) => updateProvider({ model: value })}
              pickerStyle="inline"
              label={<Text>模型</Text>}
            >
              {models.map((model) => (
                <Text key={model} tag={model}>
                  {model}
                </Text>
              ))}
            </Picker>
          ) : (
            <TextField
              title="模型"
              value={active.model}
              onChanged={(value: string) => updateProvider({ model: value })}
              prompt="例如 gpt-4o-mini"
            />
          )}
        </Section>
      ) : null}

      <Section
        header={<Text font={15}>生成设置</Text>}
        footer={<Text font={12}>自动总结默认关闭。关闭后只有你手动点击 AI 才会请求服务。</Text>}
      >
        <Picker
          value={settings.summaryLength as string}
          onChanged={(value: string) => store.updateSettings({ summaryLength: value as SummaryLength })}
          pickerStyle="inline"
          label={<Text>摘要长度</Text>}
        >
          <Text tag="short">短</Text>
          <Text tag="medium">中</Text>
          <Text tag="long">长</Text>
        </Picker>

        <Picker
          value={settings.autoSummary as string}
          onChanged={(value: string) => store.updateSettings({ autoSummary: value as AutoSummaryMode })}
          pickerStyle="inline"
          label={<Text>自动总结</Text>}
        >
          <Text tag="off">关闭</Text>
          <Text tag="favorite">收藏文章时总结</Text>
          <Text tag="read">阅读文章时总结</Text>
          <Text tag="wifi">Wi‑Fi 下自动总结</Text>
        </Picker>

        <Picker
          value={settings.summaryLanguage as string}
          onChanged={(value: string) => store.updateSettings({ summaryLanguage: value as SummaryLanguage })}
          pickerStyle="inline"
          label={<Text>文章语言</Text>}
        >
          <Text tag="auto">跟随文章</Text>
          <Text tag="zh">中文</Text>
          <Text tag="en">English</Text>
        </Picker>
      </Section>

      <Section
        header={<Text font={15}>成本控制</Text>}
        footer={<Text font={12}>长文章会先分段摘要，再合并成最终摘要，避免超过模型上下文窗口。</Text>}
      >
        <VStack alignment="leading" spacing={4} padding={{ vertical: 4 }}>
          <HStack>
            <Text font={16}>最大文章长度</Text>
            <Spacer />
            <Text font={14} foregroundStyle={palette.secondary}>
              {settings.maxArticleTokens} tokens
            </Text>
          </HStack>
          <Slider
            min={1000}
            max={24000}
            step={1000}
            value={settings.maxArticleTokens}
            onChanged={(value: number) => store.updateSettings({ maxArticleTokens: Math.round(value) })}
          />
        </VStack>
        <Toggle
          title="分段总结"
          value={settings.enableChunking}
          onChanged={(value: boolean) => store.updateSettings({ enableChunking: value })}
        />
        <Toggle
          title="缓存摘要"
          value={settings.cacheSummary}
          onChanged={(value: boolean) => store.updateSettings({ cacheSummary: value })}
        />
      </Section>

      <Section title="AI 数据">
        <HStack>
          <Text font={16}>已缓存摘要</Text>
          <Spacer />
          <Text font={14} foregroundStyle={palette.secondary}>
            {cachedCount} 篇
          </Text>
        </HStack>
        <Button
          title="清除所有 AI 摘要"
          role="destructive"
          action={() => {
            for (const article of store.articles) {
              if (article.aiSummary) store.setAISummary(article.id, undefined)
            }
          }}
          disabled={cachedCount === 0}
        />
      </Section>
    </List>
  )

  return presented ? <NavigationStack>{list}</NavigationStack> : list
}

// ── Provider 编辑 ────────────────────────────────────────────

export function ProviderEditPage({ providerID }: { providerID: string }) {
  useStoreVersion()
  const palette = usePalette()
  const provider = store.providers.find((p) => p.id === providerID)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string; detail?: string } | null>(null)

  if (!provider) {
    return (
      <List navigationTitle="Provider">
        <Text foregroundStyle={palette.secondary}>这个 Provider 已被删除。</Text>
      </List>
    )
  }

  const isCustom = provider.type === "custom"
  const models = modelsFor(provider.type)

  const patch = (value: Partial<AIProvider>) => store.upsertProvider({ ...provider, ...value })

  const saveKey = async () => {
    if (!store.privacyAcknowledged) store.acknowledgePrivacy()
    const key = await Dialog.prompt({
      title: `${provider.name} API Key`,
      message: "API Key 只保存在本机 Keychain，不会上传到任何 Lume 服务器。",
      defaultValue: "",
      obscureText: true,
      placeholder: "sk-…",
      confirmLabel: "保存",
    })
    if (key === null) return
    patch({ apiKey: key.trim() })
    setResult(null)
  }

  const runTest = async () => {
    setTesting(true)
    setResult(null)
    const outcome = await testProvider(provider)
    setResult({ ok: outcome.ok, message: outcome.message, detail: outcome.detail })
    if (outcome.ok) store.updateSettings({ activeProviderID: provider.id, defaultModel: provider.model })
    setTesting(false)
  }

  return (
    <List navigationTitle={provider.name} navigationBarTitleDisplayMode="inline" listStyle="insetGroup">
      <Section title="连接">
        <TextField title="名称" value={provider.name} onChanged={(value: string) => patch({ name: value })} />
        <TextField
          title="Base URL"
          value={provider.baseURL}
          onChanged={(value: string) => patch({ baseURL: value })}
          prompt={isCustom ? "https://example.com/v1" : undefined}
        />
        <Button
          action={() => void saveKey()}
          buttonStyle="plain"
          frame={{ maxWidth: "infinity" }}
        >
          <HStack frame={{ maxWidth: "infinity" }}>
            <Text font={16} foregroundStyle={palette.label}>
              API Key
            </Text>
            <Spacer />
            <Text font={15} foregroundStyle={palette.secondary}>
              {provider.apiKey ? "••••••••••••" : "未设置"}
            </Text>
            <Image systemName="chevron.right" font={13} foregroundStyle={palette.tertiary} />
          </HStack>
        </Button>
      </Section>

      <Section title="模型">
        {models.length ? (
          <Picker
            value={provider.model}
            onChanged={(value: string) => patch({ model: value })}
            pickerStyle="inline"
            label={<Text>模型</Text>}
          >
            {models.map((model) => (
              <Text key={model} tag={model}>
                {model}
              </Text>
            ))}
          </Picker>
        ) : (
          <TextField
            title="模型"
            value={provider.model}
            onChanged={(value: string) => patch({ model: value })}
            prompt="模型名称"
          />
        )}
        <VStack alignment="leading" spacing={4} padding={{ vertical: 4 }}>
          <HStack>
            <Text font={16}>Temperature</Text>
            <Spacer />
            <Text font={14} foregroundStyle={palette.secondary}>
              {provider.temperature.toFixed(1)}
            </Text>
          </HStack>
          <Slider
            min={0}
            max={1}
            step={0.1}
            value={provider.temperature}
            onChanged={(value: number) => patch({ temperature: value })}
          />
        </VStack>
        <HStack>
          <Text font={16}>最大输出 Tokens</Text>
          <Spacer />
          <Stepper
            onIncrement={() => patch({ maxTokens: Math.min(4000, provider.maxTokens + 200) })}
            onDecrement={() => patch({ maxTokens: Math.max(200, provider.maxTokens - 200) })}
          >
            <Text font={15} foregroundStyle={palette.secondary}>
              {provider.maxTokens}
            </Text>
          </Stepper>
        </HStack>
      </Section>

      <Section footer={<Text font={12}>测试会发送一条极短的请求，用来确认 Key、地址与模型是否可用。</Text>}>
        <Button title={testing ? "正在测试…" : "测试连接"} action={() => void runTest()} disabled={testing} />
        {result ? (
          <VStack alignment="leading" spacing={4} padding={{ vertical: 4 }}>
            <HStack spacing={7}>
              <Image
                systemName={result.ok ? "checkmark.circle.fill" : "xmark.circle.fill"}
                font={15}
                foregroundStyle={result.ok ? "systemGreen" : "systemRed"}
              />
              <Text font={15} fontWeight="medium" foregroundStyle={palette.label}>
                {result.ok ? "连接成功" : "连接失败"}
              </Text>
            </HStack>
            {result.ok ? (
              <VStack alignment="leading" spacing={2}>
                <Text font={13} foregroundStyle={palette.secondary}>
                  Model: {provider.model}
                </Text>
              </VStack>
            ) : (
              <Text font={13} foregroundStyle={palette.secondary}>
                {result.detail ?? result.message}
              </Text>
            )}
          </VStack>
        ) : null}
      </Section>

      {isCustom ? (
        <Section>
          <Button
            title="删除这个 Provider"
            role="destructive"
            action={() => {
              store.removeProvider(provider.id)
            }}
          />
        </Section>
      ) : null}
    </List>
  )
}

export function providerDefaults(type: AIProviderType): AIProvider {
  return providerTemplate(type)
}
