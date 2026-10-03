/**
 * AI Summary 面板 —— 是阅读工具，不是聊天界面。
 * 结构：一句话总结 / 核心内容 / 关键数据 / 结论（可选）。
 */

import {
  Button,
  HStack,
  Image,
  ProgressView,
  Rectangle,
  RoundedRectangle,
  ScrollView,
  Spacer,
  Text,
  VStack,
  useEffect,
  useRef,
  useState,
} from "scripting"
import type { AISummary, Article } from "../models"
import { AISummaryError, summarizeArticle } from "../lib/ai"
import { store, useStoreVersion } from "../lib/store"
import { relativeTime } from "../lib/utils"
import { roundedShape, usePalette } from "../theme"

type PanelState =
  | { kind: "loading" }
  | { kind: "ready"; summary: AISummary }
  | { kind: "empty" }
  | { kind: "error"; title: string; reasons: string[]; detail?: string }

export function AISummaryPanel({
  articleID,
  onDismiss,
  onConfigure,
}: {
  articleID: string
  onDismiss: () => void
  onConfigure: () => void
}) {
  useStoreVersion()
  const palette = usePalette()
  const [state, setState] = useState<PanelState>({ kind: "loading" })
  const [progressText, setProgressText] = useState("正在分析文章……")
  const [progressValue, setProgressValue] = useState(0.08)
  const [article, setArticle] = useState<Article | undefined>(undefined)

  const generation = useRef({ value: 0 })

  const run = async (target: Article) => {
    const token = (generation.current.value += 1)
    setState({ kind: "loading" })
    setProgressText("正在分析文章……")
    setProgressValue(0.08)
    const provider = store.activeProvider()
    if (!provider) {
      setState({ kind: "empty" })
      return
    }
    try {
      const summary = await summarizeArticle(target, {
        provider,
        length: store.settings.summaryLength,
        language: store.settings.summaryLanguage,
        maxArticleTokens: store.settings.maxArticleTokens,
        enableChunking: store.settings.enableChunking,
        onProgress: (stage, value) => {
          if (generation.current.value !== token) return
          setProgressText(stage)
          setProgressValue(Math.max(0.08, value))
        },
      })
      if (generation.current.value !== token) return
      if (store.settings.cacheSummary) store.setAISummary(target.id, summary)
      setState({ kind: "ready", summary })
    } catch (error) {
      if (generation.current.value !== token) return
      if (error instanceof AISummaryError) {
        setState({ kind: "error", title: error.title, reasons: error.reasons, detail: error.detail })
      } else {
        setState({
          kind: "error",
          title: "AI 总结失败",
          reasons: ["无法连接到 AI 服务", "请稍后重试，或检查设置"],
          detail: String((error as Error)?.message ?? error),
        })
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const full = (await store.fullArticle(articleID)) ?? undefined
      if (cancelled) return
      setArticle(full)
      if (!full) {
        setState({ kind: "error", title: "AI 总结失败", reasons: ["文章内容还没有加载完成"] })
        return
      }
      if (full.aiSummary && store.settings.cacheSummary) {
        setState({ kind: "ready", summary: full.aiSummary })
        return
      }
      if (!store.hasAIConfigured()) {
        setState({ kind: "empty" })
        return
      }
      await run(full)
    })()
    return () => {
      cancelled = true
    }
  }, [articleID])

  return (
    <ScrollView
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      background={palette.background}
      presentationDetents={["medium", "large"]}
      presentationDragIndicator="visible"
    >
      <VStack alignment="leading" spacing={16} padding={{ horizontal: 20, vertical: 18 }} frame={{ maxWidth: "infinity" }}>
        <HStack frame={{ maxWidth: "infinity" }}>
          <Text font={20} fontWeight="semibold" foregroundStyle={palette.label}>
            AI 摘要
          </Text>
          <Spacer />
          <Button action={onDismiss} buttonStyle="plain">
            <Image systemName="xmark.circle.fill" font={20} foregroundStyle={palette.tertiary} />
          </Button>
        </HStack>

        {state.kind === "loading" ? (
          <VStack alignment="leading" spacing={10} frame={{ maxWidth: "infinity" }}>
            <Text font={15} foregroundStyle={palette.secondary}>
              {progressText}
            </Text>
            <ProgressView value={progressValue} total={1} progressViewStyle="linear" tint={palette.accent} frame={{ maxWidth: "infinity" }} />
            <Text font={12} foregroundStyle={palette.tertiary}>
              摘要会缓存在本地，同一篇文章不会重复调用
            </Text>
          </VStack>
        ) : null}

        {state.kind === "empty" ? (
          <VStack alignment="leading" spacing={12} frame={{ maxWidth: "infinity" }}>
            <Text font={15} foregroundStyle={palette.secondary}>
              还没有配置 AI 服务
            </Text>
            <Text font={13} foregroundStyle={palette.tertiary}>
              Lume 的 AI 功能完全可选，不配置也不影响阅读。
            </Text>
            <Button title="配置 AI" action={onConfigure} buttonStyle="borderedProminent" />
          </VStack>
        ) : null}

        {state.kind === "error" ? (
          <VStack alignment="leading" spacing={10} frame={{ maxWidth: "infinity" }}>
            <Text font={17} fontWeight="semibold" foregroundStyle={palette.label}>
              {state.title}
            </Text>
            <Text font={14} foregroundStyle={palette.secondary}>
              无法连接到 AI 服务。
            </Text>
            <VStack alignment="leading" spacing={4}>
              <Text font={13} foregroundStyle={palette.tertiary}>
                可能原因：
              </Text>
              {state.reasons.map((reason) => (
                <Text key={reason} font={13} foregroundStyle={palette.secondary}>
                  • {reason}
                </Text>
              ))}
            </VStack>
            <HStack spacing={10}>
              <Button
                title="重新尝试"
                buttonStyle="borderedProminent"
                action={() => {
                  if (article) void run(article)
                }}
              />
              <Button title="检查设置" buttonStyle="bordered" action={onConfigure} />
            </HStack>
          </VStack>
        ) : null}

        {state.kind === "ready" ? (
          <VStack alignment="leading" spacing={18} frame={{ maxWidth: "infinity" }}>
            <Text font={16} foregroundStyle={palette.label} lineSpacing={5} textSelection>
              {state.summary.oneLine}
            </Text>

            {state.summary.points.length ? (
              <VStack alignment="leading" spacing={9} frame={{ maxWidth: "infinity" }}>
                <Text font={13} fontWeight="semibold" foregroundStyle={palette.tertiary}>
                  核心内容
                </Text>
                {state.summary.points.map((point, index) => (
                  <HStack key={`p-${index}`} spacing={9} alignment="top">
                    <Rectangle fill={palette.accent} frame={{ width: 5, height: 5 }} clipShape={roundedShape(3)} offset={{ x: 0, y: 7 }} />
                    <Text font={15} foregroundStyle={palette.label} lineSpacing={4} textSelection>
                      {point}
                    </Text>
                  </HStack>
                ))}
              </VStack>
            ) : null}

            {state.summary.data.length ? (
              <VStack alignment="leading" spacing={8} frame={{ maxWidth: "infinity" }}>
                <Text font={13} fontWeight="semibold" foregroundStyle={palette.tertiary}>
                  关键数据
                </Text>
                <HStack spacing={8} alignment="top">
                  <VStack alignment="leading" spacing={6}>
                    {state.summary.data.map((item, index) => (
                      <Text
                        key={`d-${index}`}
                        font={14}
                        foregroundStyle={palette.label}
                        padding={{ horizontal: 10, vertical: 5 }}
                        background={palette.surfaceAlt}
                        clipShape={roundedShape(8)}
                        textSelection
                      >
                        {item}
                      </Text>
                    ))}
                  </VStack>
                  <Spacer />
                </HStack>
              </VStack>
            ) : null}

            {state.summary.conclusion ? (
              <VStack alignment="leading" spacing={7} frame={{ maxWidth: "infinity" }}>
                <Text font={13} fontWeight="semibold" foregroundStyle={palette.tertiary}>
                  结论
                </Text>
                <Text font={15} foregroundStyle={palette.secondary} lineSpacing={4} textSelection>
                  {state.summary.conclusion}
                </Text>
              </VStack>
            ) : null}

            <Rectangle fill={palette.separator} frame={{ maxWidth: "infinity", height: 1 }} />

            <HStack frame={{ maxWidth: "infinity" }}>
              <Text font={12} foregroundStyle={palette.tertiary}>
                使用 {state.summary.providerName}
                {state.summary.model ? ` · ${state.summary.model}` : ""}
                {state.summary.chunks > 1 ? ` · ${state.summary.chunks} 段` : ""}
              </Text>
              <Spacer />
              <Text font={12} foregroundStyle={palette.tertiary}>
                {relativeTime(state.summary.createdAt)}
              </Text>
            </HStack>

            <HStack spacing={10}>
              <Button
                title="重新生成"
                buttonStyle="bordered"
                action={() => {
                  if (article) void run(article)
                }}
              />
              <Button title="继续阅读全文" action={onDismiss} buttonStyle="plain" tint={palette.accent} />
            </HStack>
          </VStack>
        ) : null}
      </VStack>
    </ScrollView>
  )
}
