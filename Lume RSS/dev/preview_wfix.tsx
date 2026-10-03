/**
 * 探针：在 NavigationLink 行里比较几种「封面宽度约束」写法，看哪种不会把
 * 标签的宽度提案（proposed width）撑大 —— 提案被撑大 = 整行（含文字）溢出屏幕。
 * 对照：纯文字行的提案是基准值（≈308）。
 * 运行：scripting-ts preview_ui "<项目>/dev/preview_wfix.tsx" --screenshot
 */

import "./isolate"
import { GeometryReader, Image, List, NavigationLink, NavigationStack, Rectangle, Text, VStack, ZStack } from "scripting"
import { useImageSource } from "../lib/image_cache"
import { store } from "../lib/store"

const URLS = {
  v1: "https://picsum.photos/seed/wfix1/3000/400",
  v2: "https://picsum.photos/seed/wfix2/3000/400",
  v3: "https://picsum.photos/seed/wfix3/3000/400",
  v4: "https://picsum.photos/seed/wfix4/3000/400",
}

const H = 176

/** 报告自己被提案到的宽度 */
function WidthEcho({ label }: { label: string }) {
  return (
    <GeometryReader>
      {(proxy) => {
        console.log("[probe]", label, "proposal =", proxy.size.width)
        return (
          <Text font={10} foregroundStyle="systemOrange">
            {label} 提案 {Math.round(proxy.size.width)}pt
          </Text>
        )
      }}
    </GeometryReader>
  )
}

function Cover({ url, variant, width }: { url: string; variant: string; width?: number }) {
  const source = useImageSource(url)
  const shape = { type: "rect" as const, cornerRadius: 12 }
  const frame =
    variant === "v1"
      ? { width: width ?? 300, height: H }
      : { maxWidth: width ?? 300, idealWidth: 0, minHeight: H, maxHeight: H }
  const innerFrame = { maxWidth: "infinity" as const, maxHeight: "infinity" as const }

  const photo = (props: { frame: Record<string, unknown> }) =>
    source.filePath ? (
      <Image
        filePath={source.filePath}
        resizable
        aspectRatio={{ contentMode: "fill" }}
        frame={props.frame as never}
        clipped
      />
    ) : (
      <Image imageUrl={url} resizable aspectRatio={{ contentMode: "fill" }} frame={props.frame as never} clipped />
    )

  // V3：容器用 Rectangle 撑开（理想宽度 0），图片作为 overlay 盖上去
  if (variant === "v3") {
    return (
      <Rectangle
        fill="systemGray5"
        frame={{ maxWidth: "infinity", idealWidth: 0, minHeight: H, maxHeight: H }}
        clipShape={shape}
        overlay={photo({ frame: innerFrame })}
      />
    )
  }

  // V4：ZStack 包一层，外框用 Rectangle 定死
  if (variant === "v4") {
    return (
      <ZStack frame={{ maxWidth: "infinity", idealWidth: 0, minHeight: H, maxHeight: H }} clipShape={shape}>
        <Rectangle fill="systemGray5" />
        {photo({ frame: innerFrame })}
      </ZStack>
    )
  }

  return (
    <VStack frame={frame as never} clipShape={shape}>
      {photo({ frame: innerFrame })}
    </VStack>
  )
}

store.loaded = true

const CASES: Array<{ label: string; variant: "v1" | "v2" | "v3" | "v4"; width?: number }> = [
  { label: "V1 固定 width=300", variant: "v1" },
  { label: "V2 maxWidth=300 + idealWidth 0", variant: "v2" },
  { label: "V3 容器 Rectangle + overlay", variant: "v3" },
  { label: "V4 ZStack + Rectangle", variant: "v4" },
]

export default function View() {
  return (
    <NavigationStack>
      <List
        navigationTitle="宽度约束变体"
        navigationBarTitleDisplayMode="inline"
        listRowSeparator="hidden"
        listRowInsets={{ top: 0, leading: 20, bottom: 0, trailing: 20 }}
      >
        <NavigationLink destination={<Text>纯文字</Text>}>
          <VStack alignment="leading" spacing={4} frame={{ maxWidth: "infinity" }}>
            <WidthEcho label="基准：纯文字行" />
            <Text font={15} foregroundStyle="secondaryLabel">
              基准行：这段文字的换行宽度就是行内容的真实宽度，其它变体的提案应当和它一致。
            </Text>
          </VStack>
        </NavigationLink>

        {CASES.map((item) => (
          <NavigationLink key={item.label} destination={<Text>{item.label}</Text>}>
            <VStack alignment="leading" spacing={4} frame={{ maxWidth: "infinity" }}>
              <WidthEcho label={item.label} />
              <Cover url={URLS[item.variant]} variant={item.variant} width={item.width} />
              <Text font={10} foregroundStyle="systemGreen">
                ← {item.label} 结束
              </Text>
            </VStack>
          </NavigationLink>
        ))}
      </List>
    </NavigationStack>
  )
}
