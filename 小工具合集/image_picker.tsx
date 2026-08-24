import {
  Button,
  Circle,
  Color,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  Picker,
  Rectangle,
  Section,
  Spacer,
  Text,
  TextField,
  Toolbar,
  ToolbarItem,
  VStack,
  ZStack,
  useRef,
  useState,
} from "scripting"

type CropRect = { x: number; y: number; width: number; height: number }
type Handle = "move" | "top" | "bottom" | "left" | "right" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight"
type Format = "HEX" | "RGB" | "RGBA" | "HSL"
type Sample = {
  x: number
  y: number
  viewX: number
  viewY: number
  red: number
  green: number
  blue: number
  alpha: number
  hex: string
}

const INITIAL_CROP: CropRect = { x: 0.08, y: 0.08, width: 0.84, height: 0.84 }
const FORMATS: Format[] = ["HEX", "RGB", "RGBA", "HSL"]
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const channel = (value: number) => Math.round(value * 255)

function hsl(sample: Sample) {
  const max = Math.max(sample.red, sample.green, sample.blue)
  const min = Math.min(sample.red, sample.green, sample.blue)
  const light = (max + min) / 2
  if (max === min) return `hsl(0, 0%, ${Math.round(light * 100)}%)`
  const delta = max - min
  const saturation = light > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let hue = 0
  if (max === sample.red) hue = ((sample.green - sample.blue) / delta + (sample.green < sample.blue ? 6 : 0)) / 6
  else if (max === sample.green) hue = ((sample.blue - sample.red) / delta + 2) / 6
  else hue = ((sample.red - sample.green) / delta + 4) / 6
  return `hsl(${Math.round(hue * 360)}, ${Math.round(saturation * 100)}%, ${Math.round(light * 100)}%)`
}

function formatColor(sample: Sample, format: Format) {
  const r = channel(sample.red)
  const g = channel(sample.green)
  const b = channel(sample.blue)
  if (format === "HEX") return sample.hex
  if (format === "RGB") return `rgb(${r}, ${g}, ${b})`
  if (format === "RGBA") return `rgba(${r}, ${g}, ${b}, ${sample.alpha.toFixed(3)})`
  return hsl(sample)
}

function fittedSize(image: UIImage) {
  const maxWidth = 350
  const maxHeight = 430
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height)
  return {
    width: image.width * scale,
    height: image.height * scale,
  }
}

function CropHandle({ x, y }: { x: number; y: number }) {
  return (
    <Circle
      fill="white"
      stroke={{ shapeStyle: "rgba(10,132,255,1)", strokeStyle: { lineWidth: 3 } }}
      frame={{ width: 20, height: 20 }}
      offset={{ x: x - 10, y: y - 10 }}
      allowsHitTesting={false}
    />
  )
}

function CropEditor({ image, crop, setCrop }: { image: UIImage; crop: CropRect; setCrop: (rect: CropRect) => void }) {
  const size = fittedSize(image)
  const startRect = useRef<CropRect | null>(null)
  const activeHandle = useRef<Handle | null>(null)
  const minSize = 0.1
  const edgeRange = 38
  const cornerRange = 52

  function resolveHandle(x: number, y: number, rect: CropRect): Handle | null {
    const left = rect.x * size.width
    const top = rect.y * size.height
    const right = (rect.x + rect.width) * size.width
    const bottom = (rect.y + rect.height) * size.height
    const nearLeft = Math.abs(x - left) <= edgeRange
    const nearRight = Math.abs(x - right) <= edgeRange
    const nearTop = Math.abs(y - top) <= edgeRange
    const nearBottom = Math.abs(y - bottom) <= edgeRange
    const atLeftBand = x >= left - cornerRange && x <= left + cornerRange
    const atRightBand = x >= right - cornerRange && x <= right + cornerRange
    const atTopBand = y >= top - cornerRange && y <= top + cornerRange
    const atBottomBand = y >= bottom - cornerRange && y <= bottom + cornerRange

    if (atLeftBand && atTopBand) return "topLeft"
    if (atRightBand && atTopBand) return "topRight"
    if (atLeftBand && atBottomBand) return "bottomLeft"
    if (atRightBand && atBottomBand) return "bottomRight"
    if (nearLeft && y >= top && y <= bottom) return "left"
    if (nearRight && y >= top && y <= bottom) return "right"
    if (nearTop && x >= left && x <= right) return "top"
    if (nearBottom && x >= left && x <= right) return "bottom"
    if (x > left && x < right && y > top && y < bottom) return "move"
    return null
  }

  function update(value: any) {
    if (!startRect.current) {
      startRect.current = { ...crop }
      activeHandle.current = resolveHandle(value.startLocation.x, value.startLocation.y, crop)
    }
    const base = startRect.current
    const handle = activeHandle.current
    if (!base || !handle) return
    const nx = value.translation.width / size.width
    const ny = value.translation.height / size.height
    let left = base.x
    let top = base.y
    let right = base.x + base.width
    let bottom = base.y + base.height

    if (handle === "move") {
      left = clamp(base.x + nx, 0, 1 - base.width)
      top = clamp(base.y + ny, 0, 1 - base.height)
      right = left + base.width
      bottom = top + base.height
    } else {
      if (handle === "left" || handle === "topLeft" || handle === "bottomLeft") left = clamp(base.x + nx, 0, right - minSize)
      if (handle === "right" || handle === "topRight" || handle === "bottomRight") right = clamp(base.x + base.width + nx, left + minSize, 1)
      if (handle === "top" || handle === "topLeft" || handle === "topRight") top = clamp(base.y + ny, 0, bottom - minSize)
      if (handle === "bottom" || handle === "bottomLeft" || handle === "bottomRight") bottom = clamp(base.y + base.height + ny, top + minSize, 1)
    }
    setCrop({ x: left, y: top, width: right - left, height: bottom - top })
  }

  const drag = {
    minDistance: 0,
    coordinateSpace: "local" as const,
    onChanged: update,
    onEnded: () => { startRect.current = null; activeHandle.current = null },
  }

  const left = crop.x * size.width
  const top = crop.y * size.height
  const width = crop.width * size.width
  const height = crop.height * size.height
  const right = left + width
  const bottom = top + height

  return (
    <ZStack
      alignment="topLeading"
      frame={{ width: size.width, height: size.height }}
      background="black"
      clipShape={{ type: "rect", cornerRadius: 16 }}
      contentShape="rect"
      onDragGesture={drag}
    >
      <Image image={image} resizable frame={{ width: size.width, height: size.height }} allowsHitTesting={false} />
      <Rectangle fill="rgba(255,255,255,0.82)" frame={{ width: size.width, height: top }} offset={{ x: 0, y: 0 }} allowsHitTesting={false} />
      <Rectangle fill="rgba(255,255,255,0.82)" frame={{ width: size.width, height: size.height - bottom }} offset={{ x: 0, y: bottom }} allowsHitTesting={false} />
      <Rectangle fill="rgba(255,255,255,0.82)" frame={{ width: left, height }} offset={{ x: 0, y: top }} allowsHitTesting={false} />
      <Rectangle fill="rgba(255,255,255,0.82)" frame={{ width: size.width - right, height }} offset={{ x: right, y: top }} allowsHitTesting={false} />
      <Rectangle fill="rgba(255,255,255,0.001)" stroke={{ shapeStyle: "rgba(10,132,255,1)", strokeStyle: { lineWidth: 3 } }} frame={{ width, height }} offset={{ x: left, y: top }} allowsHitTesting={false} />
      <CropHandle x={left} y={top} />
      <CropHandle x={right} y={top} />
      <CropHandle x={left} y={bottom} />
      <CropHandle x={right} y={bottom} />
    </ZStack>
  )
}

function SamplingCanvas({ image, sample, onSample, sampling, setSampling }: {
  image: UIImage
  sample: Sample | null
  onSample: (sample: Sample) => void
  sampling: boolean
  setSampling: (active: boolean) => void
}) {
  const size = fittedSize(image)

  function update(x: number, y: number) {
    const viewX = clamp(x, 0, size.width)
    const viewY = clamp(y, 0, size.height)
    const px = Math.round((viewX / size.width) * Math.max(0, image.width * image.scale - 1))
    const py = Math.round((viewY / size.height) * Math.max(0, image.height * image.scale - 1))
    const color = image.pixelColor(px, py)
    if (color) onSample({ x: px, y: py, viewX, viewY, ...color })
  }

  const sampleDrag = {
    minDistance: 0,
    coordinateSpace: "local" as const,
    onChanged: (value: any) => { setSampling(true); update(value.location.x, value.location.y) },
    onEnded: (value: any) => { update(value.location.x, value.location.y); setSampling(false) },
  }

  const lens = sample ? image.croppedTo({
    x: Math.max(0, sample.x / image.scale - 14),
    y: Math.max(0, sample.y / image.scale - 14),
    width: 28,
    height: 28,
  }) : null
  const markerX = sample ? sample.viewX - size.width / 2 : 0
  const markerY = sample ? sample.viewY - size.height / 2 : 0
  const lensX = sample ? clamp(markerX, -size.width / 2 + 55, size.width / 2 - 55) : 0
  const lensY = sample ? clamp(markerY - 72, -size.height / 2 + 55, size.height / 2 - 55) : 0

  return (
    <ZStack frame={{ width: size.width, height: size.height }} background="black" clipShape={{ type: "rect", cornerRadius: 16 }} contentShape="rect" onDragGesture={sampleDrag}>
      <Image image={image} resizable frame={{ width: size.width, height: size.height }} allowsHitTesting={false} />
      {sample ? (
        <ZStack frame={{ width: 28, height: 28 }} offset={{ x: markerX, y: markerY }} allowsHitTesting={false}>
          <Circle fill="rgba(255,255,255,0.08)" stroke={{ shapeStyle: "white", strokeStyle: { lineWidth: 2 } }} frame={{ width: 22, height: 22 }} />
          <Circle fill={sample.hex as Color} stroke={{ shapeStyle: "black", strokeStyle: { lineWidth: 1 } }} frame={{ width: 6, height: 6 }} />
        </ZStack>
      ) : null}
      {sampling && sample && lens ? (
        <ZStack frame={{ width: 104, height: 104 }} offset={{ x: lensX, y: lensY }} allowsHitTesting={false}>
          <Circle fill="white" stroke={{ shapeStyle: "rgba(0,0,0,0.35)", strokeStyle: { lineWidth: 2 } }} frame={{ width: 104, height: 104 }} />
          <Image image={lens} resizable frame={{ width: 94, height: 94 }} aspectRatio={{ value: 1, contentMode: "fill" }} clipShape="circle" interpolation="none" />
          <Rectangle fill="rgba(255,255,255,0.9)" frame={{ width: 1, height: 94 }} />
          <Rectangle fill="rgba(255,255,255,0.9)" frame={{ width: 94, height: 1 }} />
          <Circle fill={sample.hex as Color} stroke={{ shapeStyle: "white", strokeStyle: { lineWidth: 2 } }} frame={{ width: 12, height: 12 }} />
        </ZStack>
      ) : null}
    </ZStack>
  )
}

function EmptyState() {
  return (
    <VStack spacing={16} padding={{ top: 28, bottom: 28 }} frame={{ maxWidth: "infinity", alignment: "center" as any }} allowsHitTesting={false}>
      <ZStack frame={{ width: 72, height: 72 }} background="rgba(10,132,255,0.12)" clipShape="circle">
        <Image systemName="eyedropper.halffull" font="largeTitle" foregroundStyle="rgba(10,132,255,1)" />
      </ZStack>
      <VStack spacing={5}>
        <Text font="title3" fontWeight="semibold">选择一张图片开始</Text>
        <Text font="subheadline" foregroundStyle="secondaryLabel">从下面任一来源载入图片</Text>
      </VStack>
    </VStack>
  )
}

export function ImageColorPickerView() {
  const dismiss = Navigation.useDismiss()
  const [image, setImage] = useState<UIImage | null>(null)
  const [editing, setEditing] = useState(false)
  const [crop, setCrop] = useState<CropRect>(INITIAL_CROP)
  const [sample, setSample] = useState<Sample | null>(null)
  const [sampling, setSampling] = useState(false)
  const [format, setFormat] = useState<Format>("HEX")
  const [url, setUrl] = useState("")
  const [status, setStatus] = useState("")

  function loaded(next: UIImage, source: string) {
    setImage(next)
    setSample(null)
    setCrop(INITIAL_CROP)
    setEditing(false)
    setStatus(`已从${source}加载 · ${Math.round(next.width * next.scale)} × ${Math.round(next.height * next.scale)} px`)
  }

  async function choosePhotos() {
    const results = await Photos.pick({ limit: 1, mode: "default", filter: "images" })
    const picked = results[0] ? await results[0].uiImage() : null
    if (picked) loaded(picked, "图库")
  }

  async function chooseFile() {
    const paths = await DocumentPicker.pickFiles({ types: ["public.image"], allowsMultipleSelection: false })
    const picked = paths[0] ? UIImage.fromFile(paths[0]) : null
    if (picked) loaded(picked, "文件")
  }

  async function chooseURL() {
    if (!url.trim()) return
    setStatus("正在加载网络图片…")
    try {
      const picked = await UIImage.fromURL(url.trim())
      if (picked) loaded(picked, "网络")
      else setStatus("响应内容不是有效图片")
    } catch {
      setStatus("加载失败，请检查图片地址和网络")
    }
  }

  function applyCrop() {
    if (!image) return
    const next = image.croppedTo({ x: crop.x * image.width, y: crop.y * image.height, width: crop.width * image.width, height: crop.height * image.height })
    if (next) loaded(next, "裁剪结果")
  }

  async function copyValue() {
    if (!sample) return
    await Pasteboard.setString(formatColor(sample, format))
    setStatus("颜色值已复制")
  }

  const toolbar = (
    <Toolbar>
      <ToolbarItem placement="topBarLeading"><Button title="关闭" action={dismiss} /></ToolbarItem>
      {image ? (
        <ToolbarItem placement="topBarTrailing">
          {editing
            ? <HStack spacing={14}><Button title="取消" action={() => { setEditing(false); setCrop(INITIAL_CROP) }} /><Button title="应用" systemImage="checkmark" action={applyCrop} /></HStack>
            : <Button title="裁剪" systemImage="crop" action={() => { setEditing(true); setSample(null); setCrop(INITIAL_CROP) }} />}
        </ToolbarItem>
      ) : null}
    </Toolbar>
  )

  return (
    <NavigationStack>
      <List navigationTitle="图片取色" navigationBarTitleDisplayMode="inline" toolbar={toolbar} listStyle="insetGroup">
        {!image ? <Section><EmptyState /></Section> : null}

        {image ? (
          <Section
            header={<Text>{editing ? "裁剪图片" : "按住图片并滑动取色"}</Text>}
            footer={<Text>{editing ? "拖动框内移动；四条边和四个角都可以改变范围。白色区域会被移除。" : "触点圆环标明实际位置；按住滑动时放大镜会跟随手指显示在上方。"}</Text>}
          >
            <VStack spacing={14} padding={{ top: 8, bottom: 8 }} frame={{ maxWidth: "infinity", alignment: "center" as any }}>
              {editing
                ? <CropEditor image={image} crop={crop} setCrop={setCrop} />
                : <SamplingCanvas image={image} sample={sample} onSample={setSample} sampling={sampling} setSampling={setSampling} />}
            </VStack>
          </Section>
        ) : null}

        {sample && !editing ? (
          <Section header={<Text>颜色</Text>}>
            <HStack spacing={14} padding={{ top: 6, bottom: 6 }}>
              <ZStack frame={{ width: 66, height: 66 }}>
                <Circle fill={`rgb(${channel(sample.red)},${channel(sample.green)},${channel(sample.blue)})` as Color} stroke={{ shapeStyle: "rgba(0,0,0,0.18)", strokeStyle: { lineWidth: 1 } }} frame={{ width: 62, height: 62 }} />
                <Text font="caption2" fontWeight="bold" foregroundStyle={sample.red + sample.green + sample.blue > 1.65 ? "black" : "white"}>{Math.round(sample.alpha * 100)}%</Text>
              </ZStack>
              <VStack alignment="leading" spacing={4}>
                <Text font="headline">RGB {channel(sample.red)}, {channel(sample.green)}, {channel(sample.blue)}</Text>
                <Text font="subheadline" foregroundStyle="secondaryLabel">Alpha {sample.alpha.toFixed(3)} · 像素 ({sample.x}, {sample.y})</Text>
              </VStack>
              <Spacer />
            </HStack>
            <Picker title="格式" value={format} onChanged={(value: string) => setFormat(value as Format)} pickerStyle="segmented">
              {FORMATS.map((item) => <Text key={item} tag={item}>{item}</Text>)}
            </Picker>
            <Button title={formatColor(sample, format)} systemImage="doc.on.doc" action={copyValue} />
          </Section>
        ) : null}

        <Section header={<Text>{image ? "更换图片" : "图片来源"}</Text>}>
          <Button title={image ? "从图库重新选择" : "从图库选择"} systemImage="photo.on.rectangle" action={choosePhotos} />
          <Button title={image ? "从文件重新选择" : "从文件选择"} systemImage="folder" action={chooseFile} />
          <TextField title="网络图片地址" value={url} onChanged={setUrl} prompt="https://example.com/image.png" keyboardType="URL" />
          <Button title="载入网络图片" systemImage="arrow.down.circle" action={chooseURL} />
          {status ? <Text font="caption" foregroundStyle="secondaryLabel">{status}</Text> : null}
        </Section>
      </List>
    </NavigationStack>
  )
}
