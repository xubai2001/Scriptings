/**
 * 图片查看器：双指缩放（MagnifyGesture）、单指拖动、双击放大、
 * 长按保存到相册、左右滑动切换文章内的其他图片，顶部显示 "2 / 7"。
 */

import {
  Button,
  HStack,
  Image,
  ProgressView,
  Rectangle,
  Spacer,
  Text,
  VStack,
  ZStack,
  MagnifyGesture,
  useRef,
  useState,
} from "scripting"
import type { ArticleMedia } from "../models"
import { downloadImage, useImageSource } from "../lib/image_cache"
import { currentPalette } from "../theme"

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function ImageViewer({
  images,
  startIndex = 0,
  onClose,
}: {
  images: ArticleMedia[]
  startIndex?: number
  onClose: () => void
}) {
  const palette = currentPalette()
  const [index, setIndex] = useState(clamp(startIndex, 0, Math.max(0, images.length - 1)))
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [reloadToken, setReloadToken] = useState(0)
  const [toast, setToast] = useState("")
  const [toastVisible, setToastVisible] = useState(false)

  const gesture = useRef({ base: 1, panX: 0, panY: 0 })

  const current = images[index]
  // 图片一律先下载到本地再渲染，imageUrl 只做兜底（部分 CDN 会让内置加载器失败）
  const source = useImageSource(current?.url ?? "", reloadToken)
  const failed = !!current && source.failed && !source.filePath

  const showToast = (message: string) => {
    setToast(message)
    setToastVisible(true)
  }

  const reset = () => {
    gesture.current.base = 1
    gesture.current.panX = 0
    gesture.current.panY = 0
    setScale(1)
    setOffset({ x: 0, y: 0 })
    setReloadToken((value) => value + 1)
  }

  const goTo = (next: number) => {
    if (next < 0 || next >= images.length) return
    setIndex(next)
    reset()
  }

  const zoomTo = (value: number) => {
    gesture.current.base = value
    setScale(value)
    if (value <= 1) setOffset({ x: 0, y: 0 })
  }

  const saveCurrent = async () => {
    if (!current) return
    showToast("正在保存…")
    try {
      if (source.filePath) {
        await Photos.savePhoto(source.filePath)
        showToast("已保存到相册")
        return
      }
    } catch {
      // 落到下面的下载分支再试一次
    }
    const data = await downloadImage(current.url)
    if (!data) {
      showToast("保存失败，请稍后重试")
      return
    }
    try {
      const ok = await Photos.savePhoto(data)
      showToast(ok ? "已保存到相册" : "保存失败")
    } catch {
      showToast("保存失败")
    }
  }

  const magnify = MagnifyGesture()
    .onChanged((value) => {
      const next = clamp(gesture.current.base * value.magnification, 1, 6)
      setScale(next)
    })
    .onEnded((value) => {
      const next = clamp(gesture.current.base * value.magnification, 1, 6)
      if (next <= 1.05) {
        zoomTo(1)
      } else {
        zoomTo(next)
      }
    })

  return (
    <ZStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      background={palette.scheme === "dark" ? "#000000" : "#0B0B0C"}
      toast={{
        message: toast,
        isPresented: toastVisible,
        onChanged: (value: boolean) => setToastVisible(value),
        position: "bottom",
      }}
    >
      <Rectangle fill="#000000" ignoresSafeArea />

      {current && !failed ? (
        <Image
          {...(source.filePath ? { filePath: source.filePath } : { imageUrl: current.url })}
          resizable
          scaleToFit
          frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
          scaleEffect={scale}
          offset={offset}
          onLongPressGesture={saveCurrent}
          onTapGesture={{ count: 2, perform: () => (scale > 1 ? zoomTo(1) : zoomTo(2.5)) }}
          simultaneousGesture={magnify}
          onDragGesture={{
            minDistance: 6,
            onChanged: (details) => {
              if (gesture.current.base > 1) {
                setOffset({
                  x: gesture.current.panX + details.translation.width,
                  y: gesture.current.panY + details.translation.height,
                })
              }
            },
            onEnded: (details) => {
              if (gesture.current.base > 1) {
                gesture.current.panX = gesture.current.panX + details.translation.width
                gesture.current.panY = gesture.current.panY + details.translation.height
                return
              }
              if (details.translation.width < -60) goTo(index + 1)
              else if (details.translation.width > 60) goTo(index - 1)
            },
          }}
        />
      ) : null}

      {!failed && current && source.loading ? (
        <VStack spacing={8}>
          <ProgressView progressViewStyle="circular" tint="#FFFFFF" />
          <Text font={13} foregroundStyle="#9A9AA2">
            正在加载图片…
          </Text>
        </VStack>
      ) : null}

      {failed ? (
        <VStack spacing={8}>
          <Text font={15} foregroundStyle="#FFFFFF">
            图片加载失败
          </Text>
          <Text font={13} foregroundStyle="#9A9AA2" multilineTextAlignment="center">
            可能是网络问题，或这个图床不允许第三方加载。
          </Text>
          <Button
            title="重试"
            buttonStyle="borderedProminent"
            action={() => setReloadToken((value) => value + 1)}
          />
        </VStack>
      ) : null}

      {/* 顶部：关闭 + 序号 */}
      <ZStack alignment="top" frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        <HStack padding={{ horizontal: 20, vertical: 12 }} frame={{ maxWidth: "infinity" }}>
          <Button title="完成" action={onClose} buttonStyle="plain" tint="#FFFFFF" />
          <Spacer />
          {images.length > 1 ? (
            <Text font={15} fontWeight="medium" foregroundStyle="#FFFFFF">
              {index + 1} / {images.length}
            </Text>
          ) : null}
        </HStack>
      </ZStack>

      {/* 底部：切换图片 */}
      {images.length > 1 ? (
        <ZStack alignment="bottom" frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
          <HStack spacing={28} padding={{ vertical: 20 }}>
            <Button
              action={() => goTo(index - 1)}
              buttonStyle="plain"
              disabled={index === 0}
              opacity={index === 0 ? 0.3 : 1}
            >
              <Image systemName="chevron.left" font={20} foregroundStyle="#FFFFFF" />
            </Button>
            <Text font={13} foregroundStyle="#9A9AA2">
              {current?.caption ?? ""}
            </Text>
            <Button
              action={() => goTo(index + 1)}
              buttonStyle="plain"
              disabled={index === images.length - 1}
              opacity={index === images.length - 1 ? 0.3 : 1}
            >
              <Image systemName="chevron.right" font={20} foregroundStyle="#FFFFFF" />
            </Button>
          </HStack>
        </ZStack>
      ) : null}
    </ZStack>
  )
}
