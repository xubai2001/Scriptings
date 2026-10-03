/**
 * 文章详情页 —— 整个 App 的核心。
 *
 *  · 顶部操作栏只保留：返回（系统）／收藏／AI／更多
 *  · 正文按块渲染，图片直接显示，点击进入图片查看器
 *  · 三种阅读模式：阅读模式 / 原文模式 / 原网页
 *  · 阅读进度与「继续阅读」
 */

import {
  Button,
  Group,
  HStack,
  Image,
  List,
  Menu,
  Picker,
  Rectangle,
  ScrollView,
  ScrollViewReader,
  ScrollViewProxy,
  Section,
  Spacer,
  Text,
  VStack,
  ZStack,
  useEffect,
  useRef,
  useState,
} from "scripting"
import type { Article, ArticleMedia, ContentBlock } from "../models"
import { summarizeArticle } from "../lib/ai"
import { readerBlocks } from "../lib/content"
import { cacheImages } from "../lib/image_cache"
import { upgradeArticleContent } from "../lib/refresh"
import { store, useStoreVersion } from "../lib/store"
import { fontProps } from "../lib/typography"
import { hostOf, shortDate } from "../lib/utils"
import { roundedShape, usePalette } from "../theme"
import { ArticleSkeleton, articleContentWidth, RemoteImage, ThinProgressBar } from "./components"
import { AISummaryPanel } from "./ai_summary"
import { AISettingsPage } from "./ai_settings"
import { ImageViewer } from "./image_viewer"

type ReadingMode = "reader" | "original"

export function ArticlePage({ articleID }: { articleID: string }) {
  useStoreVersion()
  const palette = usePalette()
  const settings = store.settings

  const [article, setArticle] = useState<Article | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<ReadingMode>(settings.readingMode === "original" ? "original" : "reader")
  const [upgrading, setUpgrading] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)
  const [showResume, setShowResume] = useState(false)
  const [toast, setToast] = useState("")
  const [toastVisible, setToastVisible] = useState(false)

  const scrollProxy = useRef<ScrollViewProxy | null>(null)
  const mountedAt = useRef(0)
  const maxSeen = useRef(-1)

  const feed = article ? store.feedByID(article.feedID) : undefined
  const feedTitle = feed?.title ?? ""

  const blocks: ContentBlock[] = article ? (mode === "reader" ? readerBlocks(article.blocks) : article.blocks) : []
  const imageBlocks = blocks.filter((b): b is Extract<ContentBlock, { kind: "image" }> => b.kind === "image")
  const viewerImages: ArticleMedia[] = imageBlocks.map((b) => b.media)
  /** 被识别为「广告 / 模板文字 / 元信息」的块：阅读模式里不显示，原文模式里淡化显示 */
  const noiseCount = article ? article.blocks.filter((b) => b.noise).length : 0

  // ── 加载 ───────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    mountedAt.current = Date.now()
    maxSeen.current = -1
    void (async () => {
      const full = await store.fullArticle(articleID)
      if (cancelled) return
      if (!full) {
        setLoading(false)
        return
      }
      setArticle(full)
      setLoading(false)

      if (settings.markReadMode === "open" && full.state !== "read") {
        store.setReadState(articleID, "read")
      }

      // 离线阅读：把正文图片缓存到本地
      if (settings.offlineReading && full.images.length) {
        void cacheImages(full.images.map((image) => image.url), 2)
      }
      if (full.progress && full.progress.percent > 0.03 && full.state !== "read") {
        setShowResume(true)
      }

      // RSS 只给了摘要时，再去抓原网页正文
      if (settings.fetchFullContent && !full.contentFetched && full.contentSource !== "feed-full" && full.url) {
        setUpgrading(true)
        const updated = await upgradeArticleContent(articleID)
        if (!cancelled) {
          if (updated) setArticle(updated)
          setUpgrading(false)
        }
      }

      // 自动总结：手动为默认，只有用户显式开启才会请求
      if (settings.autoSummary !== "off") void autoSummarize(full)
    })()
    return () => {
      cancelled = true
    }
  }, [articleID])

  // 收藏文章时自动总结
  useEffect(() => {
    if (settings.autoSummary === "favorite" && article?.isFavorite) void autoSummarize(article)
  }, [article?.isFavorite])

  const autoSummarize = async (target: Article) => {
    if (!store.hasAIConfigured() || target.aiSummary || !settings.cacheSummary) return
    const provider = store.activeProvider()
    if (!provider) return
    try {
      const summary = await summarizeArticle(target, {
        provider,
        length: settings.summaryLength,
        language: settings.summaryLanguage,
        maxArticleTokens: settings.maxArticleTokens,
        enableChunking: settings.enableChunking,
      })
      store.setAISummary(target.id, summary)
    } catch (error) {
      console.warn("[lume] 自动总结失败", String(error))
    }
  }

  // ── 动作 ───────────────────────────────────────────────────

  const showToast = (message: string) => {
    setToast(message)
    setToastVisible(true)
  }

  const toggleFavorite = () => {
    if (!article) return
    const next = store.toggleFavorite(article.id)
    showToast(next ? "已收藏" : "已取消收藏")
  }

  const toggleLater = () => {
    if (!article) return
    const next = store.toggleLater(article.id)
    showToast(next ? "已加入稍后阅读" : "已从稍后阅读移除")
  }

  const openOriginalWeb = async () => {
    if (!article?.url) return
    setMode(settings.readingMode === "original" ? "original" : "reader")
    const controller = new WebViewController()
    try {
      await controller.loadURL(article.url)
      await controller.present({ navigationTitle: hostOf(article.url) || "原网页", fullscreen: true })
    } catch {
      await Safari.openURL(article.url)
    } finally {
      try {
        controller.dispose()
      } catch {
        // 忽略
      }
    }
  }

  const shareArticle = async (includeSummary: boolean) => {
    if (!article) return
    const parts: string[] = [article.title]
    if (includeSummary && article.aiSummary) {
      parts.push("")
      parts.push("AI 摘要")
      parts.push(article.aiSummary.oneLine)
      if (article.aiSummary.points.length) {
        parts.push("核心观点")
        for (const point of article.aiSummary.points) parts.push(`• ${point}`)
      }
      parts.push("")
      parts.push(`原文：${article.url}`)
    } else {
      if (feedTitle) parts.push(feedTitle)
      parts.push(article.url)
    }
    await ShareSheet.present([parts.join("\n")])
  }

  const copyLink = async () => {
    if (!article) return
    await Pasteboard.setString(article.url)
    showToast("链接已复制")
  }

  const onBlockAppear = (block: ContentBlock, index: number) => {
    if (!article) return
    // 忽略首屏批量出现，只有在真正往下读之后才记进度
    if (Date.now() - mountedAt.current < 700) return
    if (index <= maxSeen.current) return
    maxSeen.current = index
    store.setProgress(article.id, (index + 1) / Math.max(1, blocks.length), block.id)
  }

  const resumeReading = () => {
    const blockID = article?.progress?.blockID
    if (blockID && scrollProxy.current) {
      scrollProxy.current.scrollTo(blockID, "top")
    }
    setShowResume(false)
  }

  // ── 渲染 ───────────────────────────────────────────────────

  const fontSize = settings.fontSize || 17
  const lineSpacing = Math.max(2, Math.round((settings.lineSpacing || 1.55) * 4))
  const titleFont = fontProps(settings.titleFont, 26)
  const bodyFont = fontProps(settings.bodyFont, fontSize)

  const renderBlock = (block: ContentBlock, index: number) => {
    const onAppear = () => onBlockAppear(block, index)
    switch (block.kind) {
      case "paragraph":
        return block.text ? (
          <Text
            key={block.id}
            {...bodyFont}
            lineSpacing={lineSpacing}
            foregroundStyle={palette.label}
            textSelection
            onAppear={onAppear}
          >
            {block.text}
          </Text>
        ) : null

      case "heading":
        return (
          <Text
            key={block.id}
            {...fontProps(settings.titleFont, block.level <= 2 ? 22 : 19)}
            fontWeight="semibold"
            foregroundStyle={palette.label}
            lineSpacing={3}
            textSelection
            onAppear={onAppear}
          >
            {block.text}
          </Text>
        )

      case "image": {
        const imageIndex = imageBlocks.findIndex((b) => b.id === block.id)
        return (
          <VStack key={block.id} alignment="leading" spacing={7} onAppear={onAppear}>
            <RemoteImage
              url={block.media.url}
              mode="fit"
              width={articleContentWidth(settings.articleMaxWidth || 680)}
              radius={12}
              placeholderHeight={200}
              onTap={() => setViewerIndex(Math.max(0, imageIndex))}
              onLongPress={() => setViewerIndex(Math.max(0, imageIndex))}
            />
            {block.media.caption || block.media.alt ? (
              <Text font={13} foregroundStyle={palette.tertiary} multilineTextAlignment="leading">
                {block.media.caption ?? block.media.alt ?? ""}
              </Text>
            ) : null}
          </VStack>
        )
      }

      case "video":
        return (
          <Button
            key={block.id}
            action={() => Safari.openURL(block.media.url)}
            buttonStyle="plain"
            onAppear={onAppear}
          >
            <HStack
              spacing={10}
              padding={{ horizontal: 14, vertical: 12 }}
              frame={{ maxWidth: "infinity" }}
              background={palette.surfaceAlt}
              clipShape={roundedShape(10)}
            >
              <Image systemName="play.rectangle" font={18} foregroundStyle={palette.accent} />
              <Text font={14} foregroundStyle={palette.label}>
                视频 / 音频
              </Text>
              <Spacer />
              <Image systemName="arrow.up.right" font={13} foregroundStyle={palette.tertiary} />
            </HStack>
          </Button>
        )

      case "quote":
        return (
          <HStack
            key={block.id}
            spacing={12}
            padding={{ vertical: 10, horizontal: 14 }}
            frame={{ maxWidth: "infinity" }}
            background={palette.quoteBackground}
            clipShape={roundedShape(10)}
            onAppear={onAppear}
          >
            <Rectangle fill={palette.accent} frame={{ width: 3 }} clipShape={roundedShape(2)} />
            <VStack alignment="leading" spacing={6}>
              <Text {...fontProps(settings.bodyFont, fontSize - 1)} foregroundStyle={palette.secondary} lineSpacing={lineSpacing} textSelection>
                {block.text}
              </Text>
              {block.cite ? (
                <Text font={12} foregroundStyle={palette.tertiary}>
                  {block.cite}
                </Text>
              ) : null}
            </VStack>
          </HStack>
        )

      case "code":
        return (
          <ScrollView
            key={block.id}
            axes="horizontal"
            scrollIndicator="hidden"
            background={palette.codeBackground}
            clipShape={roundedShape(10)}
            onAppear={onAppear}
          >
            <Text font={13} fontDesign="monospaced" foregroundStyle={palette.label} padding={14} textSelection>
              {block.text}
            </Text>
          </ScrollView>
        )

      case "list":
        return (
          <VStack key={block.id} alignment="leading" spacing={7} onAppear={onAppear}>
            {block.items.map((item, itemIndex) => (
              <HStack key={`${block.id}-${itemIndex}`} spacing={10} alignment="top">
                <Text font={fontSize} foregroundStyle={palette.tertiary} frame={{ width: 22 }} multilineTextAlignment="trailing">
                  {block.ordered ? `${itemIndex + 1}.` : "•"}
                </Text>
                <Text {...bodyFont} lineSpacing={lineSpacing} foregroundStyle={palette.label} textSelection>
                  {item}
                </Text>
              </HStack>
            ))}
          </VStack>
        )

      case "table":
        return (
          <ScrollView key={block.id} axes="horizontal" scrollIndicator="hidden" onAppear={onAppear}>
            <VStack alignment="leading" spacing={0}>
              {block.rows.map((row, rowIndex) => (
                <HStack key={`${block.id}-r${rowIndex}`} spacing={0}>
                  {row.map((cell, cellIndex) => (
                    <Text
                      key={`${block.id}-r${rowIndex}-c${cellIndex}`}
                      {...fontProps(settings.bodyFont, 14)}
                      fontWeight={rowIndex === 0 ? "semibold" : "regular"}
                      foregroundStyle={palette.label}
                      padding={{ horizontal: 12, vertical: 8 }}
                      frame={{ minWidth: 110 }}
                      background={rowIndex === 0 ? palette.surfaceAlt : palette.surface}
                    >
                      {cell}
                    </Text>
                  ))}
                </HStack>
              ))}
            </VStack>
          </ScrollView>
        )

      case "divider":
        return <Rectangle key={block.id} fill={palette.separator} frame={{ maxWidth: "infinity", height: 1 }} onAppear={onAppear} />

      default:
        return null
    }
  }

  const percent = article?.progress?.percent ?? 0

  const header = (
    <VStack alignment="leading" spacing={10} frame={{ maxWidth: "infinity" }}>
      {feedTitle ? (
        <Text font={13} fontWeight="medium" foregroundStyle={palette.accent}>
          {feedTitle}
        </Text>
      ) : null}
      <Text {...titleFont} fontWeight="bold" foregroundStyle={palette.label} lineSpacing={4} textSelection>
        {article?.title ?? "…"}
      </Text>
      <HStack spacing={6}>
        {article?.author ? (
          <Text font={13} foregroundStyle={palette.secondary}>
            {article.author}
          </Text>
        ) : null}
        <Text font={13} foregroundStyle={palette.secondary}>
          {shortDate(article?.publishedAt ?? 0)}
        </Text>
        <Text font={13} foregroundStyle={palette.tertiary}>
          ·
        </Text>
        <Text font={13} foregroundStyle={palette.secondary}>
          {article?.readingMinutes ?? 1} min read
        </Text>
      </HStack>

      {article && article.blocks.length > 4 && settings.showReadingProgress ? (
        <HStack spacing={10} frame={{ maxWidth: "infinity" }} padding={{ top: 4 }}>
          <ThinProgressBar percent={percent} />
          <Text font={11} foregroundStyle={palette.tertiary}>
            {Math.round(percent * 100)}%
          </Text>
        </HStack>
      ) : null}

      {/* 三种阅读模式 */}
      {article ? (
        <VStack alignment="leading" spacing={6} frame={{ maxWidth: "infinity" }}>
          <Picker
            value={mode as string}
            onChanged={(value: string) => {
              if (value === "web") void openOriginalWeb()
              else setMode(value === "original" ? "original" : "reader")
            }}
            pickerStyle="segmented"
            label={
              <Text font={12} fontWeight="medium" foregroundStyle={palette.tertiary}>
                阅读方式
              </Text>
            }
            frame={{ maxWidth: "infinity" }}
          >
            <Text tag="reader">阅读模式</Text>
            <Text tag="original">原文</Text>
            <Text tag="web">原网页</Text>
          </Picker>
          {/* 两种模式看起来是否一样，得说清楚，否则用户会以为开关没生效 */}
          <Text font={11} foregroundStyle={palette.tertiary} multilineTextAlignment="leading">
            {mode === "reader"
              ? noiseCount > 0
                ? `阅读模式：已为你去掉 ${noiseCount} 处广告 / 模板文字。想看被去掉的内容就切到「原文」。`
                : "阅读模式：这篇文章没有可精简的内容。"
              : mode === "original"
                ? noiseCount > 0
                  ? `原文模式：包含 ${noiseCount} 处广告 / 模板文字（已淡化显示），阅读模式会隐藏它们。`
                  : "原文模式：这篇文章没有可精简的内容，所以看起来和阅读模式一样。"
                : "原网页：直接加载原站页面，排版由网站决定。"}
          </Text>
        </VStack>
      ) : null}

      {showResume && article ? (
        <Button action={resumeReading} buttonStyle="plain">
          <HStack
            spacing={8}
            padding={{ horizontal: 12, vertical: 9 }}
            frame={{ maxWidth: "infinity" }}
            background={palette.surfaceAlt}
            clipShape={roundedShape(9)}
          >
            <Image systemName="bookmark" font={13} foregroundStyle={palette.accent} />
            <Text font={13} foregroundStyle={palette.label}>
              继续阅读？
            </Text>
            <Spacer />
            <Text font={13} foregroundStyle={palette.tertiary}>
              {Math.round((article.progress?.percent ?? 0) * 100)}%
            </Text>
          </HStack>
        </Button>
      ) : null}

      <Rectangle fill={palette.separator} frame={{ maxWidth: "infinity", height: 1 }} padding={{ top: 4 }} />
    </VStack>
  )

  return (
    <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <ScrollViewReader>
        {(proxy: ScrollViewProxy) => {
          scrollProxy.current = proxy
          return (
            <ScrollView
              frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
              background={palette.background}
              navigationTitle=""
              navigationBarTitleDisplayMode="inline"
              toolbar={{
                topBarTrailing: [
                  <Button action={toggleFavorite} buttonStyle="plain">
                    <Image
                      systemName={article?.isFavorite ? "star.fill" : "star"}
                      font={17}
                      foregroundStyle={article?.isFavorite ? palette.accent : palette.label}
                    />
                  </Button>,
                  <Button action={() => setAiOpen(true)} buttonStyle="plain">
                    <Text font={15} fontWeight="semibold" foregroundStyle={article?.aiSummary ? palette.accent : palette.label}>
                      AI
                    </Text>
                  </Button>,
                  <Menu label={<Image systemName="ellipsis.circle" font={17} />}>
                    <Button
                      title={article?.state === "read" ? "标记为未读" : "标记为已读"}
                      systemImage={article?.state === "read" ? "envelope.badge" : "checkmark.circle"}
                      action={() => {
                        if (!article) return
                        if (article.state === "read") store.setReadState(article.id, "unread")
                        else store.setReadState(article.id, "read")
                      }}
                    />
                    <Button title={article?.isLater ? "移出稍后阅读" : "稍后阅读"} systemImage="clock" action={toggleLater} />
                    <Button title="分享" systemImage="square.and.arrow.up" action={() => void shareArticle(false)} />
                    {article?.aiSummary ? (
                      <Button title="分享 AI 摘要" systemImage="sparkles" action={() => void shareArticle(true)} />
                    ) : null}
                    <Button title="复制链接" systemImage="link" action={() => void copyLink()} />
                    <Button title="在浏览器打开" systemImage="safari" action={() => void Safari.openURL(article?.url ?? "")} />
                    <Button title="原网页" systemImage="globe" action={() => void openOriginalWeb()} />
                  </Menu>,
                ],
              }}
              toast={{
                message: toast,
                isPresented: toastVisible,
                onChanged: (value: boolean) => setToastVisible(value),
                position: "bottom",
              }}
              sheet={[
                {
                  isPresented: aiOpen,
                  onChanged: (value: boolean) => setAiOpen(value),
                  content: (
                    <AISummaryPanel
                      articleID={articleID}
                      onDismiss={() => setAiOpen(false)}
                      onConfigure={() => {
                        setAiOpen(false)
                        setAiSettingsOpen(true)
                      }}
                    />
                  ),
                },
                {
                  isPresented: aiSettingsOpen,
                  onChanged: (value: boolean) => setAiSettingsOpen(value),
                  content: <AISettingsPage presented />,
                },
              ]}
              fullScreenCover={
                viewerIndex != null
                  ? {
                      isPresented: true,
                      onChanged: (value: boolean) => {
                        if (!value) setViewerIndex(null)
                      },
                      content: (
                        <ImageViewer images={viewerImages} startIndex={viewerIndex ?? 0} onClose={() => setViewerIndex(null)} />
                      ),
                    }
                  : undefined
              }
            >
              <VStack alignment="leading" spacing={16} padding={{ horizontal: 20, vertical: 16 }} frame={{ maxWidth: settings.articleMaxWidth || 680 }}>
                {loading ? (
                  <VStack spacing={0} frame={{ maxWidth: "infinity" }}>
                    <ArticleSkeleton />
                    <ArticleSkeleton />
                  </VStack>
                ) : !article ? (
                  <Text font={15} foregroundStyle={palette.secondary}>
                    文章内容加载失败。
                  </Text>
                ) : (
                  <VStack alignment="leading" spacing={16} frame={{ maxWidth: "infinity" }}>
                    {header}

                    {mode === "reader" && upgrading ? (
                      <Text font={12} foregroundStyle={palette.tertiary}>
                        正在获取完整正文…
                      </Text>
                    ) : null}

                    {article.contentSource === "feed-summary" && !upgrading && blocks.length <= 2 ? (
                      <VStack alignment="leading" spacing={10} frame={{ maxWidth: "infinity" }} padding={{ vertical: 6 }}>
                        <Text font={14} foregroundStyle={palette.secondary}>
                          这篇文章没有提供完整正文。当前 RSS 只提供了摘要。
                        </Text>
                        <Button action={openOriginalWeb} buttonStyle="plain">
                          <Text font={14} fontWeight="medium" foregroundStyle={palette.accent}>
                            阅读原文
                          </Text>
                        </Button>
                      </VStack>
                    ) : null}

                    {blocks.map((block, index) => (
                      <Group key={block.id} opacity={block.noise ? 0.45 : 1}>
                        {renderBlock(block, index)}
                      </Group>
                    ))}

                    <VStack alignment="leading" spacing={10} padding={{ top: 18 }} frame={{ maxWidth: "infinity" }}>
                      <Rectangle fill={palette.separator} frame={{ maxWidth: "infinity", height: 1 }} />
                      <Button
                        action={() => {
                          store.setReadState(article.id, "read")
                          showToast("已标记为已读")
                        }}
                        buttonStyle="plain"
                      >
                        <Text font={14} fontWeight="medium" foregroundStyle={palette.accent}>
                          标记为已读
                        </Text>
                      </Button>
                    </VStack>
                  </VStack>
                )}
              </VStack>
            </ScrollView>
          )
        }}
      </ScrollViewReader>
    </ZStack>
  )
}
