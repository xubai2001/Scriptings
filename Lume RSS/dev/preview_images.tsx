/**
 * 图片渲染专项预览：验证三种典型 URL 形态都能显示
 *   1. 少数派图床（查询串带斜杠、多余参数）
 *   2. 无扩展名的图床地址（会缓存成 .img 文件）
 *   3. 普通 .jpg
 * 运行：scripting-ts preview_ui "<项目>/dev/preview_images.tsx" --screenshot
 */

import "./isolate"
import { ScrollView, Text, VStack } from "scripting"
import { RemoteImage, FeedIcon } from "../ui/components"
import { usePalette } from "../theme"

const CASES: Array<{ label: string; url: string }> = [
  {
    label: "少数派图床（?imageView2/2/w/1120/q/90/interlace/1/ignore-error/1）",
    url: "https://cdnfile.sspai.com/2026/09/12/32887265aa63018a36fa7df7238c8481.jpg?imageView2/2/w/1120/q/90/interlace/1/ignore-error/1",
  },
  { label: "无扩展名地址（缓存为 .img）", url: "https://picsum.photos/seed/lume-a/1200/800" },
  { label: "普通 .jpg", url: "https://picsum.photos/seed/lume-b/1200/800.jpg" },
]

export default function View() {
  const palette = usePalette()
  return (
    <ScrollView axes="vertical">
      <VStack alignment="leading" spacing={18} padding={{ horizontal: 20, vertical: 24 }}>
        <Text font={22} fontWeight="bold" foregroundStyle={palette.label}>
          图片渲染检查
        </Text>
        {CASES.map((item) => (
          <VStack key={item.url} alignment="leading" spacing={8}>
            <Text font={13} foregroundStyle={palette.secondary}>
              {item.label}
            </Text>
            <RemoteImage url={item.url} mode="fill" height={200} radius={12} placeholderHeight={200} />
          </VStack>
        ))}
        <VStack alignment="leading" spacing={8}>
          <Text font={13} foregroundStyle={palette.secondary}>
            Feed 图标（favicon 服务）
          </Text>
          <FeedIcon title="少数派" iconURL="https://www.google.com/s2/favicons?domain=sspai.com&sz=128" size={40} />
        </VStack>
      </VStack>
    </ScrollView>
  )
}
