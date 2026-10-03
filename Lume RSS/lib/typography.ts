/**
 * 字体工具 —— 一处生成 `font` / `fontDesign` 属性，正文、标题、列表共用。
 *
 * 平台能力（已核实）：
 *   <Text font={17} />                             系统字体 + 字号
 *   <Text font={{ name: "PingFangSC-Regular", size: 17 }} />   指定字体族
 *   <Text fontDesign="serif" />                    系统内置变体：default/monospaced/rounded/serif
 *
 * 注意：字体名写错（或设备上没有该字体）时 SwiftUI 会静默回退到系统字体，
 * 代码层面无法校验，所以设置页要如实说明这一点。
 */

import type { FontDesignOption, FontSetting } from "../models"

export interface FontPreset {
  id: string
  label: string
  design: FontDesignOption
  /** 空字符串 = 用系统字体 */
  family: string
}

/**
 * 预设字体。前四个用系统内置变体（一定生效、不会有名称问题），
 * 后面几个是 iOS 上自带的中文 / 西文字体，名称写的是常见的 family 名。
 */
export const FONT_PRESETS: FontPreset[] = [
  { id: "system", label: "跟随系统", design: "default", family: "" },
  { id: "serif", label: "系统衬线（宋）", design: "serif", family: "" },
  { id: "rounded", label: "系统圆体", design: "rounded", family: "" },
  { id: "mono", label: "系统等宽", design: "monospaced", family: "" },
  { id: "pingfang", label: "苹方（黑体）", design: "default", family: "PingFangSC-Regular" },
  { id: "songti", label: "宋体", design: "default", family: "Songti SC" },
  { id: "kaiti", label: "楷体", design: "default", family: "Kaiti SC" },
  { id: "yuanti", label: "圆体", design: "default", family: "Yuanti SC" },
  { id: "hiragino", label: "冬青黑体", design: "default", family: "Hiragino Sans GB" },
  { id: "georgia", label: "Georgia（西文衬线）", design: "default", family: "Georgia" },
  { id: "times", label: "Times New Roman", design: "default", family: "Times New Roman" },
  { id: "menlo", label: "Menlo（等宽）", design: "default", family: "Menlo" },
  { id: "palatino", label: "Palatino", design: "default", family: "Palatino" },
  { id: "custom", label: "自定义…", design: "default", family: "" },
]

/** 用户选了「自定义…」时先填入的示例名，方便直接改 */
export const CUSTOM_FONT_PLACEHOLDER = "PingFangSC-Regular"

/** 兜底：旧数据 / 脏数据都能安全用 */
export function normalizeFontSetting(value: unknown): FontSetting {
  const raw = (value ?? {}) as Partial<FontSetting>
  const design: FontDesignOption =
    raw.design === "serif" || raw.design === "rounded" || raw.design === "monospaced" ? raw.design : "default"
  return { design, family: typeof raw.family === "string" ? raw.family : "" }
}

/** 当前设置对应哪个预设（找不到就当作自定义） */
export function fontPresetID(setting: FontSetting | undefined): string {
  const font = normalizeFontSetting(setting)
  if (font.family) {
    const hit = FONT_PRESETS.find((preset) => preset.family && preset.family === font.family)
    return hit ? hit.id : "custom"
  }
  const hit = FONT_PRESETS.find((preset) => !preset.family && preset.design === font.design)
  return hit ? hit.id : "system"
}

export function presetByID(id: string): FontPreset {
  return FONT_PRESETS.find((preset) => preset.id === id) ?? FONT_PRESETS[0]
}

/** 设置页 Picker 用：把选中的预设写成 FontSetting */
export function settingFromPreset(id: string, current: FontSetting): FontSetting {
  const preset = presetByID(id)
  if (preset.id === "custom") {
    return { design: "default", family: current.family.trim() || CUSTOM_FONT_PLACEHOLDER }
  }
  return { design: preset.design, family: preset.family }
}

export function fontDisplayName(setting: FontSetting | undefined): string {
  const font = normalizeFontSetting(setting)
  if (font.family) return font.family
  return presetByID(fontPresetID(font)).label
}

export type FontProps = { font: number | { name: string; size: number }; fontDesign?: FontDesignOption }

/**
 * 生成可以直接展开到 <Text> 上的字体属性：
 *   <Text {...fontProps(settings.bodyFont, 17)}>正文</Text>
 */
export function fontProps(setting: FontSetting | undefined, size: number): FontProps {
  const font = normalizeFontSetting(setting)
  const family = font.family.trim()
  if (family) return { font: { name: family, size } }
  if (font.design === "default") return { font: size }
  return { font: size, fontDesign: font.design }
}
