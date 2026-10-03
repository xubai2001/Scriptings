/**
 * 视觉规范：颜色 / 排版 / 间距。
 *
 * 浅色接近系统背景而不是纯白；深色用深灰而不是纯黑；
 * 不使用渐变、玻璃拟态、大面积阴影。颜色用系统色关键字 + 少量自定义值，
 * 保证在浅色 / 深色下都有正确对比度。
 */

import { useColorScheme } from "scripting"
import type { Color, Shape } from "scripting"

/** 平台的 clipShape 只接受 Shape 值，不接受 <RoundedRectangle/> 这样的视图 */
export function roundedShape(radius: number): Shape {
  return { type: "rect", cornerRadius: Math.max(0, radius) }
}

export interface Palette {
  scheme: "light" | "dark"
  /** 页面背景 */
  background: Color
  /** 卡片 / 列表行背景 */
  surface: Color
  /** 次级表面 */
  surfaceAlt: Color
  /** 正文文字 */
  label: Color
  /** 辅助信息 */
  secondary: Color
  /** 更弱的辅助信息 */
  tertiary: Color
  /** 极淡分割线 */
  separator: Color
  /** 强调色（克制） */
  accent: Color
  /** 未读圆点 */
  unread: Color
  /** 骨架屏 */
  skeleton: Color
  /** 代码块背景 */
  codeBackground: Color
  /** 引用块背景 */
  quoteBackground: Color
  /** 图片占位 */
  imagePlaceholder: Color
}

export function paletteFor(scheme: "light" | "dark"): Palette {
  if (scheme === "dark") {
    return {
      scheme,
      background: "#111111",
      surface: "#1A1A1C",
      surfaceAlt: "#202024",
      label: "#F2F2F4",
      secondary: "#9C9CA3",
      tertiary: "#6E6E75",
      separator: "#2A2A2E",
      accent: "#6E96FF",
      unread: "#6E96FF",
      skeleton: "#232327",
      codeBackground: "#18181B",
      quoteBackground: "#191A1D",
      imagePlaceholder: "#1E1E22",
    }
  }
  return {
    scheme,
    background: "#FCFCFD",
    surface: "#FFFFFF",
    surfaceAlt: "#F4F4F6",
    label: "#111114",
    secondary: "#6B6B72",
    tertiary: "#9A9AA1",
    separator: "#EAEAEE",
    accent: "#3D6FF0",
    unread: "#3D6FF0",
    skeleton: "#ECECEF",
    codeBackground: "#F5F5F7",
    quoteBackground: "#F7F7F9",
    imagePlaceholder: "#EFEFF2",
  }
}

/** 组件里用 */
export function usePalette(): Palette {
  const scheme = useColorScheme()
  return paletteFor(scheme === "dark" ? "dark" : "light")
}

/** 非组件代码里用（例如弹窗构造时） */
export function currentPalette(): Palette {
  try {
    return paletteFor(Device.colorScheme === "dark" ? "dark" : "light")
  } catch {
    return paletteFor("light")
  }
}

// ── 排版 ─────────────────────────────────────────────────────

export const Type = {
  /** 列表标题 */
  listTitle: 19,
  /** 列表摘要 */
  listSummary: 15,
  /** 辅助信息 */
  meta: 13,
  /** 文章正文 */
  body: 17,
  /** 文章标题 */
  articleTitle: 26,
}

export const Space = {
  page: 20,
  row: 16,
  gap: 10,
}

export function articleBodyFontSize(setting: number): number {
  return setting || Type.body
}

export function articleLineSpacing(setting: number, fontSize: number): number {
  return Math.max(2, Math.round((setting || 1.55) * fontSize - fontSize * 1.2))
}

/** 用于图片圆角（平台没有 cornerRadius 修饰符，要 clipShape） */
export const Radius = {
  image: 12,
  card: 14,
  small: 8,
}
