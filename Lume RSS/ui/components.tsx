/**
 * 共用小组件。注意：Navigation.present 呈现的视图拿不到 React Context，
 * 所以调色板通过 usePalette() 在每个组件里取，而不是用 Context 传。
 */

import {
  Button,
  HStack,
  Image,
  ProgressView,
  Rectangle,
  ScrollView,
  Spacer,
  Text,
  VStack,
  ZStack,
} from "scripting"
import { heroImage } from "../lib/media"
import { useImageSource } from "../lib/image_cache"
import type { LightArticle } from "../lib/store"
import { store } from "../lib/store"
import { fontProps } from "../lib/typography"
import { initialsOf, relativeTime } from "../lib/utils"
import { roundedShape, usePalette } from "../theme"

const FULL = "infinity" as const

/** 封面图固定高度 */
export const COVER_HEIGHT = 176

/**
 * 列表行内容区的宽度（硬约束）—— 封面图的宽度就取这个值。
 *
 * 为什么要自己算：resizable + aspectRatio 的图片有自己的「理想宽度」= 框高 × 原始宽高比
 * （一张 3000×400 的封面在 176pt 高的框里 ≈ 1320pt）。列表在估算行尺寸时给的是不确定的提案，
 * 此时平台会把这个理想宽度算进去 —— 整个列表的内容宽度被撑到屏幕外，于是「带封面图的行文字
 * 不换行、左右被裁切」，连没有封面的纯文字行也跟着遭殃。maxWidth: "infinity" + idealWidth: 0
 * 实测拦不住（NavigationLink 行里标签的宽度提案会从 308pt 变成 370/432pt）。
 *
 * 组成（实测 iPhone 16 Pro，屏幕 402×874pt，行内容宽 308pt）：
 *   402 - listRowInsets(20×2) - List 行内边距(16×2) - NavigationLink 箭头(≈24) = 308
 * 取屏幕「短边」是为了横屏时也不会算大；再小的分栏布局本来就不支持。
 */
function listRowContentWidth(): number {
  return Math.max(200, Math.floor(screenShortSide() - 96))
}

/** 屏幕短边（横屏时也不会把可用宽度算大） */
function screenShortSide(): number {
  const screen = Device?.screen
  const width = Number(screen?.width) || 393
  const height = Number(screen?.height) || 852
  return Math.min(width, height)
}

/**
 * 正文列的内容宽度（文章页正文 VStack：padding 20 + maxWidth = articleMaxWidth）。
 * 正文配图用它做硬宽度：高度让等比缩放自己算（所以只给 width，不给 height）。
 */
export function articleContentWidth(articleMaxWidth: number): number {
  const limit = Number(articleMaxWidth) > 0 ? Number(articleMaxWidth) : 680
  return Math.max(200, Math.floor(Math.min(screenShortSide(), limit) - 40))
}

// ── 骨架屏 ───────────────────────────────────────────────────

function SkeletonBar({ width, height = 14 }: { width?: number; height?: number }) {
  const palette = usePalette()
  return (
    <Rectangle
      fill={palette.skeleton}
      frame={width ? { width, height } : { maxWidth: FULL, height }}
      clipShape={roundedShape(4)}
    />
  )
}

/** 文章列表的加载占位：不使用转圈 */
export function ArticleSkeleton({ hero = false }: { hero?: boolean }) {
  const palette = usePalette()
  return (
    <VStack alignment="leading" spacing={9} padding={{ vertical: 14 }} frame={{ maxWidth: FULL }}>
      <SkeletonBar height={18} />
      <SkeletonBar width={120} height={12} />
      {hero ? (
        <Rectangle
          fill={palette.skeleton}
          frame={{ maxWidth: FULL, height: 168 }}
          clipShape={roundedShape(12)}
        />
      ) : null}
      <SkeletonBar height={13} />
      <SkeletonBar width={200} height={13} />
    </VStack>
  )
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  const items: number[] = []
  for (let i = 0; i < rows; i++) items.push(i)
  return (
    <VStack spacing={0} padding={{ horizontal: 20 }}>
      {items.map((i) => (
        <ArticleSkeleton key={`sk-${i}`} hero={i === 0} />
      ))}
    </VStack>
  )
}

// ── 空状态 ───────────────────────────────────────────────────

export function EmptyState(props: {
  systemImage: string
  title: string
  message: string
  actionTitle?: string
  action?: () => void
}) {
  const palette = usePalette()
  return (
    <VStack spacing={12} padding={{ horizontal: 40, vertical: 60 }} frame={{ maxWidth: FULL }}>
      <Image systemName={props.systemImage} font={34} foregroundStyle={palette.tertiary} />
      <Text font={17} fontWeight="semibold" foregroundStyle={palette.label} multilineTextAlignment="center">
        {props.title}
      </Text>
      <Text font={14} foregroundStyle={palette.secondary} multilineTextAlignment="center">
        {props.message}
      </Text>
      {props.actionTitle && props.action ? (
        <Button title={props.actionTitle} action={props.action} buttonStyle="bordered" />
      ) : null}
    </VStack>
  )
}

/**
 * 远程图片：一律先下载到本地再渲染（部分 CDN 的 URL 形态会让内置加载器失败），
 * 下载完成前用 imageUrl 兜底。
 */
export function RemoteImage({
  url,
  mode = "fill",
  width,
  height = COVER_HEIGHT,
  radius = 12,
  placeholderHeight = 180,
  onTap,
  onLongPress,
}: {
  url: string
  /** fill：固定高度裁切（列表主图）；fit：按比例撑满宽度（正文配图） */
  mode?: "fill" | "fit"
  /**
   * 硬宽度。fill（列表封面）默认用列表行内容宽度，fit（正文配图）建议传 articleContentWidth()。
   * 不要传 "infinity"：那等于把宽度交还给布局系统，见下面的说明。
   */
  width?: number
  height?: number
  radius?: number
  placeholderHeight?: number
  onTap?: () => void
  onLongPress?: () => void
}) {
  const palette = usePalette()
  const source = useImageSource(url)
  const shape = roundedShape(radius)

  /*
   * ⚠️ 宽度必须是显式数值，不能交给布局系统算（详见 listRowContentWidth 的说明）。
   *  - fill（列表封面）：宽度 = width ?? 行内容宽度，高度固定，clipped 裁掉超出的部分。
   *  - fit（正文配图）：给了 width 就定宽（高度等比缩放自己算）；没给才退回容器相对宽度。
   */
  const sizing =
    mode === "fit" && width == null
      ? { containerRelativeFrame: { axes: "horizontal" as const, count: 1, spacing: 0 } }
      : {}
  const frame =
    mode === "fill"
      ? { width: width ?? listRowContentWidth(), height: height }
      : width != null
        ? { width }
        : undefined

  if (source.filePath) {
    return (
      <Image
        filePath={source.filePath}
        resizable
        aspectRatio={{ contentMode: mode }}
        {...sizing}
        frame={frame}
        clipped={mode === "fill"}
        clipShape={shape}
        onTapGesture={onTap}
        onLongPressGesture={onLongPress}
      />
    )
  }

  return (
    <Image
      imageUrl={url}
      resizable
      aspectRatio={{ contentMode: mode }}
      {...sizing}
      frame={frame}
      clipped={mode === "fill"}
      clipShape={shape}
      placeholder={
        <Rectangle
          fill={palette.imagePlaceholder}
          {...sizing}
          frame={
            width == null
              ? { width: listRowContentWidth(), height: placeholderHeight }
              : { width, height: placeholderHeight }
          }
        />
      }
      onTapGesture={onTap}
      onLongPressGesture={onLongPress}
    />
  )
}

// ── 退出按钮（全屏模态的左上角 X）────────────────────────

export function ExitButton({ onExit }: { onExit: () => void }) {
  const palette = usePalette()
  return (
    <Button action={onExit} buttonStyle="plain">
      <Image systemName="xmark" font={16} foregroundStyle={palette.secondary} />
    </Button>
  )
}

// ── Feed 图标（icon → favicon → 首字母）──────────────────────

export function FeedIcon({ title, iconURL, size = 28 }: { title: string; iconURL?: string; size?: number }) {
  const palette = usePalette()
  const source = useImageSource(iconURL ?? "")
  const radius = Math.max(5, Math.round(size * 0.28))
  const shape = roundedShape(radius)

  const fallback = (
    <ZStack frame={{ width: size, height: size }} clipShape={shape}>
      <Rectangle fill={palette.surfaceAlt} />
      <Text font={Math.round(size * 0.44)} fontWeight="semibold" foregroundStyle={palette.secondary}>
        {initialsOf(title)}
      </Text>
    </ZStack>
  )

  if (!iconURL || source.failed) return fallback
  if (source.filePath) {
    return (
      <Image
        filePath={source.filePath}
        resizable
        aspectRatio={{ contentMode: "fill" }}
        frame={{ width: size, height: size }}
        clipShape={shape}
      />
    )
  }
  return (
    <Image
      imageUrl={iconURL}
      resizable
      aspectRatio={{ contentMode: "fill" }}
      frame={{ width: size, height: size }}
      clipShape={shape}
      placeholder={fallback}
    />
  )
}

// ── 未读圆点 ─────────────────────────────────────────────────

export function UnreadDot({ visible, size = 7 }: { visible: boolean; size?: number }) {
  const palette = usePalette()
  if (!visible) return null
  return (
    <Rectangle
      fill={palette.unread}
      frame={{ width: size, height: size }}
      clipShape={roundedShape(size / 2)}
    />
  )
}

// ── 文章行 ───────────────────────────────────────────────────

export function ArticleRow({
  article,
  feedTitle,
}: {
  article: LightArticle
  feedTitle: string
}) {
  const palette = usePalette()
  const hero = heroImage(article.images)
  const unread = article.state !== "read"

  return (
    <VStack alignment="leading" spacing={7} padding={{ vertical: 14 }} frame={{ maxWidth: FULL }}>
      <Text {...fontProps(store.settings.titleFont, 19)} fontWeight="semibold" foregroundStyle={palette.label} lineLimit={3} multilineTextAlignment="leading">
        {article.title}
      </Text>

      <HStack spacing={6} frame={{ maxWidth: FULL }}>
        <Text font={13} foregroundStyle={palette.secondary} lineLimit={1}>
          {feedTitle}
        </Text>
        <Text font={13} foregroundStyle={palette.tertiary}>
          ·
        </Text>
        <Text font={13} foregroundStyle={palette.secondary}>
          {relativeTime(article.publishedAt)}
        </Text>
        <Spacer />
        {article.aiSummary ? (
          <Text font={11} fontWeight="semibold" foregroundStyle={palette.accent}>
            AI
          </Text>
        ) : null}
      </HStack>

      {hero ? <RemoteImage
          url={hero.url}
          mode="fill"
          height={COVER_HEIGHT}
          radius={12}
          placeholderHeight={COVER_HEIGHT}
        /> : null}

      {article.summary ? (
        <Text font={15} foregroundStyle={palette.secondary} lineLimit={3} multilineTextAlignment="leading">
          {article.summary}
        </Text>
      ) : null}

      <HStack spacing={8} frame={{ maxWidth: FULL }}>
        <Text font={12} foregroundStyle={palette.tertiary}>
          {article.readingMinutes} min read
        </Text>
        <Spacer />
        {unread ? (
          <HStack spacing={5}>
            <UnreadDot visible />
            <Text font={12} foregroundStyle={palette.tertiary}>
              未读
            </Text>
          </HStack>
        ) : null}
      </HStack>
    </VStack>
  )
}

// ── 横向筛选条 ───────────────────────────────────────────────

export function FilterBar<T extends string>({
  items,
  value,
  onChanged,
}: {
  items: Array<{ value: T; label: string }>
  value: T
  onChanged: (value: T) => void
}) {
  const palette = usePalette()
  return (
    <ScrollView axes="horizontal" scrollIndicator="hidden" frame={{ maxWidth: FULL }}>
      <HStack spacing={8} padding={{ horizontal: 20, vertical: 6 }}>
        {items.map((item) => {
          const active = item.value === value
          return (
            <Button key={item.value} action={() => onChanged(item.value)} buttonStyle="plain">
              <Text
                font={14}
                fontWeight={active ? "semibold" : "regular"}
                foregroundStyle={active ? palette.surface : palette.secondary}
                padding={{ horizontal: 14, vertical: 7 }}
                background={active ? palette.label : palette.surfaceAlt}
                clipShape={roundedShape(16)}
              >
                {item.label}
              </Text>
            </Button>
          )
        })}
      </HStack>
    </ScrollView>
  )
}

// ── 细进度条 ─────────────────────────────────────────────────

export function ThinProgressBar({ percent }: { percent: number }) {
  const palette = usePalette()
  return (
    <ProgressView
      value={Math.max(0, Math.min(1, percent))}
      total={1}
      progressViewStyle="linear"
      tint={palette.accent}
      frame={{ maxWidth: FULL }}
    />
  )
}

/** 小标签 */
export function Chip({ text }: { text: string }) {
  const palette = usePalette()
  return (
    <Text
      font={12}
      fontWeight="medium"
      foregroundStyle={palette.secondary}
      padding={{ horizontal: 9, vertical: 4 }}
      background={palette.surfaceAlt}
      clipShape={roundedShape(7)}
    >
      {text}
    </Text>
  )
}

/** 分组标题（非 List 场景用） */
export function GroupLabel({ text }: { text: string }) {
  const palette = usePalette()
  return (
    <Text font={13} fontWeight="medium" foregroundStyle={palette.tertiary} padding={{ leading: 20, top: 18, bottom: 6 }}>
      {text}
    </Text>
  )
}
