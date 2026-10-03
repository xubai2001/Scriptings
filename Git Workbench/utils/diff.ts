/** 轻量行级差异：用于「查看差异」时的可读展示（不做三方合并） */

export type DiffLine = {
  type: "same" | "add" | "del"
  text: string
}

/** 简化算法：裁掉公共前缀与后缀，中间部分整段标为删除 + 新增 */
export function simpleDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = (oldText || "").split("\n")
  const newLines = (newText || "").split("\n")

  let prefix = 0
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++
  }

  let suffix = 0
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++
  }

  const out: DiffLine[] = []
  for (let i = 0; i < prefix; i++) out.push({ type: "same", text: oldLines[i] })
  for (let i = prefix; i < oldLines.length - suffix; i++) {
    out.push({ type: "del", text: oldLines[i] })
  }
  for (let i = prefix; i < newLines.length - suffix; i++) {
    out.push({ type: "add", text: newLines[i] })
  }
  for (let i = oldLines.length - suffix; i < oldLines.length; i++) {
    out.push({ type: "same", text: oldLines[i] })
  }
  return out
}

/** 把差异渲染成带 +/- 前缀的纯文本，便于放进只读编辑器 */
export function diffToText(lines: DiffLine[], maxLines = 400): string {
  const shown = lines.length > maxLines ? lines.slice(0, maxLines) : lines
  const body = shown
    .map(line => `${line.type === "add" ? "+" : line.type === "del" ? "-" : " "}${line.text}`)
    .join("\n")
  return lines.length > maxLines
    ? `${body}\n… （还有 ${lines.length - maxLines} 行未显示）`
    : body
}

export function diffSummary(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  lines.forEach(line => {
    if (line.type === "add") added++
    if (line.type === "del") removed++
  })
  return { added, removed }
}
