/**
 * 文件类型识别：图标、颜色、语言名、可预览性、编辑器语法扩展名。
 *
 * Scripting 内置 `Editor` 的语法高亮按扩展名选择，文档明确支持的包括
 * tsx / ts / js / jsx / txt / md / css / html / json；其他扩展名统一回落到
 * 最接近的高亮（见 editorExt）。
 */

import type { Color } from "scripting"

export type FileKind =
  | "markdown"
  | "code"
  | "data"
  | "text"
  | "image"
  | "binary"
  | "archive"
  | "unknown"

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "heic", "bmp", "ico", "tiff"]
const BINARY_EXT = [
  "pdf",
  "zip",
  "gz",
  "tar",
  "7z",
  "rar",
  "ipa",
  "apk",
  "bin",
  "dylib",
  "so",
  "a",
  "o",
  "class",
  "jar",
  "ttf",
  "otf",
  "woff",
  "woff2",
  "mp3",
  "mp4",
  "mov",
  "m4a",
  "wav",
  "db",
  "sqlite",
  "plist",
]
const ARCHIVE_EXT = ["zip", "gz", "tar", "7z", "rar", "ipa", "apk"]

/** 扩展名 → 高亮用扩展名（Editor 组件） */
const HIGHLIGHT_MAP: Record<string, string> = {
  md: "md",
  markdown: "md",
  ts: "ts",
  mts: "ts",
  tsx: "tsx",
  js: "js",
  mjs: "js",
  cjs: "js",
  jsx: "jsx",
  json: "json",
  json5: "json",
  jsonc: "json",
  jsonl: "json",
  jsonnet: "json",
  css: "css",
  scss: "css",
  less: "css",
  html: "html",
  htm: "html",
  xml: "html",
  svg: "html",
  vue: "html",
  txt: "txt",
  text: "txt",
  log: "txt",
  yml: "txt",
  yaml: "txt",
  toml: "txt",
  ini: "txt",
  conf: "txt",
  env: "txt",
  py: "txt",
  rb: "txt",
  go: "txt",
  rs: "txt",
  swift: "txt",
  kt: "txt",
  java: "txt",
  c: "txt",
  h: "txt",
  cc: "txt",
  cpp: "txt",
  hpp: "txt",
  cs: "txt",
  php: "txt",
  sh: "txt",
  bash: "txt",
  zsh: "txt",
  fish: "txt",
  ps1: "txt",
  bat: "txt",
  sql: "txt",
  csv: "txt",
  tsv: "txt",
  patch: "txt",
  diff: "txt",
  gitignore: "txt",
}

const LANGUAGE_LABEL: Record<string, string> = {
  md: "Markdown",
  markdown: "Markdown",
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  json: "JSON",
  jsonl: "JSONL",
  jsonnet: "Jsonnet",
  yaml: "YAML",
  yml: "YAML",
  css: "CSS",
  scss: "SCSS",
  html: "HTML",
  htm: "HTML",
  xml: "XML",
  svg: "SVG",
  py: "Python",
  rb: "Ruby",
  go: "Go",
  rs: "Rust",
  swift: "Swift",
  kt: "Kotlin",
  java: "Java",
  c: "C",
  h: "C Header",
  cpp: "C++",
  cc: "C++",
  hpp: "C++ Header",
  cs: "C#",
  php: "PHP",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  ps1: "PowerShell",
  sql: "SQL",
  csv: "CSV",
  tsv: "TSV",
  toml: "TOML",
  ini: "INI",
  txt: "Text",
  log: "Log",
  patch: "Diff",
  diff: "Diff",
}

export function extensionOf(name: string): string {
  const lower = (name || "").toLowerCase()
  const dot = lower.lastIndexOf(".")
  if (dot <= 0 || dot === lower.length - 1) {
    if (lower === "makefile" || lower === "dockerfile" || lower === ".gitignore") return "txt"
    return ""
  }
  return lower.slice(dot + 1)
}

export function fileKind(name: string): FileKind {
  const ext = extensionOf(name)
  if (IMAGE_EXT.indexOf(ext) !== -1) return "image"
  if (BINARY_EXT.indexOf(ext) !== -1) {
    return ARCHIVE_EXT.indexOf(ext) !== -1 ? "archive" : "binary"
  }
  if (ext === "md" || ext === "markdown") return "markdown"
  if (ext === "json" || ext === "jsonl" || ext === "jsonnet" || ext === "yml" || ext === "yaml" || ext === "csv" || ext === "tsv") {
    return "data"
  }
  if (ext === "") return "text"
  if (HIGHLIGHT_MAP[ext]) return "code"
  return "unknown"
}

/** Editor 组件使用的语法扩展名（类型上收窄到平台声明的集合；运行时对未知扩展名安全回落） */
export type EditorExt = "tsx" | "ts" | "js" | "jsx" | "txt" | "md" | "css" | "html" | "json"

/** 真实扩展名优先（平台对未知扩展名不会报错，只会回落成普通文本） */
export function editorExt(name: string): string {
  const ext = extensionOf(name)
  if (!ext) return "txt"
  if (HIGHLIGHT_MAP[ext]) return HIGHLIGHT_MAP[ext]
  if (/^[a-z0-9]{1,8}$/.test(ext)) return ext
  return "txt"
}

/** 传给 EditorController 时使用；运行时行为与 editorExt 一致 */
export function editorExtTyped(name: string): EditorExt {
  return editorExt(name) as EditorExt
}

export function languageLabel(name: string): string {
  const ext = extensionOf(name)
  return LANGUAGE_LABEL[ext] || (ext ? ext.toUpperCase() : "Text")
}

export function isMarkdown(name: string): boolean {
  const ext = extensionOf(name)
  return ext === "md" || ext === "markdown"
}

export function isImage(name: string): boolean {
  return IMAGE_EXT.indexOf(extensionOf(name)) !== -1
}

export function isTextLike(name: string): boolean {
  const kind = fileKind(name)
  return kind === "code" || kind === "data" || kind === "text" || kind === "markdown"
}

/** 文件图标（SF Symbol） */
export function fileIcon(name: string, type?: string): string {
  if (type === "dir") return "folder.fill"
  if (type === "submodule") return "shippingbox.fill"
  if (type === "symlink") return "arrow.turn.up.right"
  const kind = fileKind(name)
  if (kind === "image") return "photo"
  if (kind === "archive") return "archivebox"
  if (kind === "binary") return "doc.zipper"
  if (kind === "markdown") return "doc.richtext"
  if (kind === "data") return "curlybraces"
  if (kind === "code") return "chevron.left.forwardslash.chevron.right"
  return "doc.text"
}

/** 文件图标颜色（保持克制，只做轻量区分） */
export function fileTint(name: string, type?: string): Color {
  if (type === "dir") return "systemBlue"
  if (type === "submodule") return "systemOrange"
  switch (fileKind(name)) {
    case "markdown":
      return "systemTeal"
    case "data":
      return "systemPurple"
    case "code":
      return "systemIndigo"
    case "image":
      return "systemPink"
    default:
      return "secondaryLabel"
  }
}

/** 语言 → 编辑辅助符号（编辑器底部工具栏，§21） */
export function symbolKeys(name: string): string[] {
  const ext = extensionOf(name)
  if (ext === "json" || ext === "jsonl" || ext === "jsonnet") {
    return ["  ", "{", "}", "[", "]", ":", ",", '"', "\n"]
  }
  if (ext === "md" || ext === "markdown") {
    return ["  ", "#", "*", "-", "[", "]", "(", ")", "`", "\n"]
  }
  if (ext === "html" || ext === "xml" || ext === "svg") {
    return ["  ", "<", ">", "/", "=", '"', "\n"]
  }
  if (ext === "css" || ext === "scss") {
    return ["  ", "{", "}", ":", ";", "(", ")", "\n"]
  }
  if (ext === "py") {
    return ["    ", ":", "(", ")", "[", "]", '"', "'", "#", "\n"]
  }
  if (ext === "sh" || ext === "bash" || ext === "zsh" || ext === "ps1") {
    return ["  ", "$", '"', "'", "|", "-", "(", ")", "\n"]
  }
  if (
    ext === "ts" ||
    ext === "tsx" ||
    ext === "js" ||
    ext === "jsx" ||
    ext === "swift" ||
    ext === "go" ||
    ext === "rs" ||
    ext === "java" ||
    ext === "kt" ||
    ext === "c" ||
    ext === "cpp" ||
    ext === "cs"
  ) {
    return ["  ", "{", "}", "(", ")", "[", "]", "=>", ";", '"', "\n"]
  }
  return ["  ", "{", "}", "[", "]", "(", ")", '"', "\n"]
}

/** 大文件阈值（字节） */
export const DEFAULT_LARGE_FILE = 512 * 1024
export const DEFAULT_MAX_PREVIEW = 2 * 1024 * 1024
