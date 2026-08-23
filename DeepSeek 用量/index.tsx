import {
  Script,
  Navigation,
  NavigationStack,
  List,
  Section,
  Text,
  Button,
  TextField,
  Picker,
  HStack,
  VStack,
  Spacer,
  ProgressView,
  Chart,
  ChartPlotStyle,
  ChartSelection,
  BarChart,
  BarStackChart,
  LineChart,
  AreaChart,
  RuleLineForLabelChart,
  ChartGesture,
  DragGesture,
  Color,
  Menu,
  Image,
  Widget,
  Toolbar,
  ToolbarItem,
  useState,
  useEffect,
} from "scripting"
import {
  SavedKey,
  KeyUsage,
  UsageSeries,
  CostSeries,
  UserSummary,
  UsageMetrics,
  fetchUsage,
  fetchCost,
  fetchSummary,
  settle,
  aggregate,
  applyCost,
  mergeAll,
  usageWindow,
  dailySeries,
  loadSavedKeys,
  saveSavedKeys,
  formatNumber,
  formatCompact,
  formatMoney,
  totalTokens,
  cacheHitRate,
  dayLabel,
  maskToken,
  emptyMetrics,
} from "./usage"
const ALL_KEY_ID = "__all__"

// 一个 Key 的三类数据：用量（tokens）、按天金额、账户概览
type KeyData = {
  usage: UsageSeries[]
  cost: CostSeries[]
  summary: UserSummary
}

async function fetchKeyData(token: string, start: number, end: number): Promise<KeyData> {
  const [usage, cost, summary] = await Promise.all([
    fetchUsage(token, start, end),
    fetchCost(token, start, end),
    fetchSummary(token),
  ])
  return { usage, cost, summary }
}

function timeLabel(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── 图表类型切换 ──────────────────────────────────────────────────────────────

type ChartKind = "bar" | "stack" | "line"

const CHART_KINDS: ChartKind[] = ["bar", "stack", "line"]

const CHART_KIND_LABELS: Record<ChartKind, string> = {
  bar: "柱状图",
  stack: "堆叠图",
  line: "折线图",
}

/** 标题右侧的下拉弹窗按键：切换柱状图 / 堆叠图 / 折线图。 */
function ChartTypeMenu({
  value,
  onChanged,
}: {
  value: ChartKind
  onChanged: (kind: ChartKind) => void
}) {
  return (
    <Menu
      label={
        <HStack spacing={4}>
          <Text>{CHART_KIND_LABELS[value]}</Text>
          <Image systemName="chevron.down" />
        </HStack>
      }
    >
      {CHART_KINDS.map(kind => (
        <Button
          key={kind}
          title={kind === value ? `${CHART_KIND_LABELS[kind]} ✓` : CHART_KIND_LABELS[kind]}
          action={() => onChanged(kind)}
        />
      ))}
    </Menu>
  )
}

/** 按 Key 分组的每日堆叠数据：同一天不同 key 各占一段（用于 BarStackChart）。 */
function stackMarks(
  keys: KeyUsage[],
  start: number,
  end: number,
  pick: (k: KeyUsage, t: number) => number
): { category: string; label: string; value: number }[] {
  const marks: { category: string; label: string; value: number }[] = []
  for (const k of keys) {
    for (let t = start; t < end; t += 86400) {
      marks.push({
        category: k.name,
        label: dayLabel(t),
        value: pick(k, t),
      })
    }
  }
  return marks
}

// ── 趋势折线图（与 widget.tsx 的 TrendChart 同款） ──────────────────────────────

/** 平滑折线 + 面积渐变 + 首/中/今三个日期刻度；折线带圆形标记点。
 * 配合 `selection`（chartXSelection 单值选择）：选中点画竖参考线 + 悬浮数值气泡
 * （Multiple Charts Example 同款交互）。坐标轴只用系统自动 Y 轴 + 显式钉 X 轴三个日期刻度。 */
function TrendChart({
  marks,
  height,
  lineColor,
  gradient,
  selection,
  valueFormatter,
}: {
  marks: { label: string; value: number }[]
  height: number
  lineColor: Color
  gradient: [Color, Color]
  selection?: ChartSelection
  valueFormatter: (v: number) => string
}) {
  if (marks.length === 0) {
    return (
      <HStack>
        <Spacer />
        <Text foregroundStyle="secondaryLabel">暂无用量数据</Text>
        <Spacer />
      </HStack>
    )
  }
  const selected =
    selection && selection.value != null
      ? (marks.find(m => m.label === String(selection.value)) ?? null)
      : null
  return (
    <Chart
      frame={{ height }}
      chartXSelection={selection}
      chartXAxis={{
        position: "bottom",
        tick: false,
        gridLine: false,
        values: {
          type: "values",
          values: [
            marks[0].label,
            marks[Math.floor((marks.length - 1) / 2)].label,
            marks[marks.length - 1].label,
          ],
        },
        valueLabel: {
          multiLabelAlignment: "center",
        },
      }}
    >
      <AreaChart
        marks={marks.map(m => ({
          ...m,
          interpolationMethod: "catmullRom",
          foregroundStyle: gradient,
        }))}
      />
      <LineChart
        marks={marks.map(m => ({
          ...m,
          interpolationMethod: "catmullRom",
          foregroundStyle: lineColor,
          lineStyle: { lineWidth: 2, lineCap: "round", lineJoin: "round" },
          symbol: "circle",
        }))}
      />
      {selected ? (
        <RuleLineForLabelChart
          marks={[
            {
              label: selected.label,
              foregroundStyle: { color: "gray", opacity: 0.5 },
              annotation: {
                position: "top",
                overflowResolution: { x: "fit", y: "disabled" },
                content: (
                  <Text
                    font={10}
                    fontWeight="semibold"
                    foregroundStyle="#FFFFFF"
                    padding={{ horizontal: 8, vertical: 4 }}
                    background={lineColor}
                    clipShape={{ type: "rect", cornerRadius: 6, style: "continuous" }}
                  >
                    {selected.label} · {valueFormatter(selected.value)}
                  </Text>
                ),
              },
            },
          ]}
        />
      ) : null}
      <ChartPlotStyle>
        {(plot) => plot.clipShape("rect")}
      </ChartPlotStyle>
    </Chart>
  )
}

/** 柱状图视觉增强：圆角 + 原生渐变 + 高亮柱（加深色 + 顶部数值标注）。
 * 所有柱用 `color` 渐变填充（SwiftUI `Color.gradient` 标准竖渐变）；有选中点时高亮选中柱
 * （ChartGesture 点击命中，不挂 chartXSelection 故无调暗变色），否则高亮值最大的柱。 */
function styleBarMarks(
  marks: { label: string; value: number }[],
  color: Color,
  accent: Color,
  fmt: (v: number) => string,
  selectedLabel?: string | null
) {
  if (marks.length === 0) return marks
  let activeIdx = -1
  if (selectedLabel != null) {
    activeIdx = marks.findIndex(m => m.label === selectedLabel)
  } else {
    let maxIdx = 0
    for (let i = 1; i < marks.length; i++) {
      if (marks[i].value > marks[maxIdx].value) maxIdx = i
    }
    activeIdx = marks[maxIdx].value > 0 ? maxIdx : -1
  }
  return marks.map((m, i) => {
    const isActive = i === activeIdx
    return {
      ...m,
      cornerRadius: 5,
      foregroundStyle: {
        color: isActive ? accent : color,
        gradient: true,
      } as const,
      annotation: isActive
        ? {
            position: "top" as const,
            overflowResolution: { x: "fit" as const, y: "fit" as const },
            content: (
              <Text font={10} fontWeight="semibold" foregroundStyle={accent}>
                {fmt(m.value)}
              </Text>
            ),
          }
        : undefined,
    }
  })
}

// ── 堆叠图样式（按 Key 分配颜色 + 图例） ──────────────────────────────────────

/** 堆叠图各 Key 的配色（与折线/柱状主色同系）。 */
const STACK_PALETTE: Color[] = [
  "#2563EB", "#F59E0B", "#10B981", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F43F5E", "#84CC16",
]

/** 把每个 Key 固定到调色板颜色：chartForegroundStyleScale 钉死分类配色，
 * 防止 BarStackChart 在图表重建/重渲染时自动配色漂移（per-mark foregroundStyle 会被其内部
 * foregroundStyle(by:) 覆盖，之前长按别处堆叠“变色”就是自动配色被重排）。 */
function stackColorScale(keys: KeyUsage[]): Record<string, Color> {
  const scale: Record<string, Color> = {}
  keys.forEach((k, i) => {
    scale[k.name] = STACK_PALETTE[i % STACK_PALETTE.length]
  })
  return scale
}

/** 给堆叠 marks 的每根柱顶部分段加圆角（其余分段 0，避免中段圆角接缝）。
 * 颜色不再在此设置——由 Chart 的 chartForegroundStyleScale 统一钉死。 */
function styleStackMarks(marks: { category: string; label: string; value: number }[]) {
  if (marks.length === 0) return marks
  const lastIdxByLabel = new Map<string, number>()
  for (let i = 0; i < marks.length; i++) lastIdxByLabel.set(marks[i].label, i)
  return marks.map((m, i) => ({
    ...m,
    cornerRadius: lastIdxByLabel.get(m.label) === i ? 5 : 0,
  }))
}

/** 堆叠图图例：颜色圆点 + Key 名（仅多个 Key 时显示）。 */
function StackLegend({ keys }: { keys: KeyUsage[] }) {
  if (keys.length <= 1) return null
  return (
    <HStack spacing={10} padding={{ top: 8 }}>
      {keys.map((k, i) => (
        <HStack key={k.id} spacing={3}>
          <Text font={9} foregroundStyle={STACK_PALETTE[i % STACK_PALETTE.length]}>
            ●
          </Text>
          <Text font={10} foregroundStyle="secondaryLabel">
            {k.name}
          </Text>
        </HStack>
      ))}
    </HStack>
  )
}

/** 点击图表点位后展示的当日用量明细面板。 */
function DayDetail({
  day,
  onClear,
}: {
  day: { time: number; metrics: UsageMetrics; cost: number }
  onClear: () => void
}) {
  return (
    <VStack spacing={4} padding={{ top: 10 }} alignment="leading">
      <HStack>
        <Text font={11} fontWeight="semibold" foregroundStyle="secondaryLabel">
          {dayLabel(day.time)} 用量明细
        </Text>
        <Spacer />
        <Button title="清除" action={onClear} />
      </HStack>
      <HStack>
        <Text>请求次数</Text>
        <Spacer />
        <Text>{formatNumber(day.metrics.REQUEST)}</Text>
      </HStack>
      <HStack>
        <Text>输入 Tokens（命中/未命中）</Text>
        <Spacer />
        <Text>
          {formatNumber(day.metrics.PROMPT_CACHE_HIT_TOKEN)} /{" "}
          {formatNumber(day.metrics.PROMPT_CACHE_MISS_TOKEN)}
        </Text>
      </HStack>
      <HStack>
        <Text>输出 Tokens</Text>
        <Spacer />
        <Text>{formatNumber(day.metrics.RESPONSE_TOKEN)}</Text>
      </HStack>
      <HStack>
        <Text>总 Tokens</Text>
        <Spacer />
        <Text>{formatNumber(totalTokens(day.metrics))}</Text>
      </HStack>
      <HStack>
        <Text>缓存命中率</Text>
        <Spacer />
        <Text>{cacheHitRate(day.metrics).toFixed(1)}%</Text>
      </HStack>
      <HStack>
        <Text>消费金额</Text>
        <Spacer />
        <Text>{formatMoney(day.cost)}</Text>
      </HStack>
    </VStack>
  )
}

// ── 设置页（管理已保存的 Key） ────────────────────────────────────────────────

function SettingsView({
  savedKeys,
  onSave,
  onDelete,
  onClose,
}: {
  savedKeys: SavedKey[]
  onSave: (token: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [input, setInput] = useState("")
  const [justSaved, setJustSaved] = useState(false)

  function handleSave() {
    const t = input.trim()
    if (!t) return
    onSave(t)
    setInput("")
    setJustSaved(true)
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="Key 管理"
        navigationBarTitleDisplayMode="inline"
        toolbar={
          <Toolbar>
            <ToolbarItem placement="topBarTrailing">
              <Button title="完成" action={onClose} />
            </ToolbarItem>
          </Toolbar>
        }
      >
        <Section
          header={<Text>已保存的 Key</Text>}
          footer={<Text>Key 仅保存在本机 App Group 目录，不会上传到 iCloud</Text>}
        >
          {savedKeys.length === 0 ? (
            <Text>暂无保存的 Key</Text>
          ) : (
            savedKeys.map(k => (
              <HStack key={k.id} spacing={8}>
                <Text>{maskToken(k.token)}</Text>
                <Spacer />
                <Button title="删除" action={() => onDelete(k.id)} />
              </HStack>
            ))
          )}
        </Section>

        <Section header={<Text>添加 Key</Text>}>
          <TextField
            title="Bearer Key"
            prompt="粘贴 DeepSeek 平台 usage 页的 Bearer Token"
            value={input}
            onChanged={setInput}
          />
          <Button title="保存" action={handleSave} />
        </Section>

        {justSaved ? (
          <Section>
            <Text>已保存 ✓ 关闭页面后会自动刷新用量</Text>
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  )
}

// ── 主界面 ───────────────────────────────────────────────────────────────────

function MainView() {
  const dismiss = Navigation.useDismiss()
  const [savedKeys, setSavedKeys] = useState<SavedKey[] | null>(null)
  const [periodDays, setPeriodDays] = useState<number>(7)
  const [selectedKeyId, setSelectedKeyId] = useState<string>(ALL_KEY_ID)
  const [keyList, setKeyList] = useState<KeyUsage[]>([])
  const [summary, setSummary] = useState<UserSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [usageChartKind, setUsageChartKind] = useState<ChartKind>("bar")
  const [costChartKind, setCostChartKind] = useState<ChartKind>("bar")
  const [previewFamily, setPreviewFamily] = useState<string>("systemSmall")
  const [previewMsg, setPreviewMsg] = useState<string | null>(null)
  const [selectedUsageDay, setSelectedUsageDay] = useState<string | null>(null)
  const [selectedCostDay, setSelectedCostDay] = useState<string | null>(null)

  // 启动时读取本地保存的 Key
  useEffect(() => {
    setSavedKeys(loadSavedKeys())
  }, [])

  // 拉取用量数据
  async function load(keys: SavedKey[], days: number) {
    if (keys.length === 0) {
      setKeyList([])
      setSummary(null)
      setLoading(false)
      setError(null)
      setUpdatedAt(null)
      return
    }
    setLoading(true)
    setError(null)
    const { start, end } = usageWindow(days)
    const results = await settle(keys.map(k => fetchKeyData(k.token, start, end)))
    const ok: KeyData[] = []
    let failures = 0
    let firstErr = ""
    for (const r of results) {
      if (r.ok && r.value) ok.push(r.value)
      else {
        failures++
        if (!firstErr && r.error) firstErr = r.error
      }
    }
    if (ok.length === 0) {
      setKeyList([])
      setSummary(null)
      setLoading(false)
      setError(firstErr || "获取用量失败")
      setUpdatedAt(null)
      return
    }
    const keysData = aggregate(ok.map(o => o.usage))
    for (const o of ok) applyCost(keysData, [o.cost])
    setKeyList(keysData)
    setSummary(ok[0]?.summary ?? null)
    setUpdatedAt(Date.now())
    setError(failures > 0 ? `有 ${failures} 个 Key 获取失败，仅显示成功的数据` : null)
    setLoading(false)
  }

  useEffect(() => {
    if (savedKeys) load(savedKeys, periodDays)
  }, [savedKeys, periodDays])

  function handleAddKey(token: string) {
    const t = token.trim()
    if (!t) return
    const next: SavedKey[] = [
      ...(savedKeys ?? []),
      {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        token: t,
        createdAt: Date.now(),
      },
    ]
    setSavedKeys(next)
    saveSavedKeys(next)
  }

  function handleDeleteKey(id: string) {
    const next = (savedKeys ?? []).filter(k => k.id !== id)
    setSavedKeys(next)
    saveSavedKeys(next)
    if (selectedKeyId !== ALL_KEY_ID && !next.some(k => k.id === selectedKeyId)) {
      setSelectedKeyId(ALL_KEY_ID)
    }
  }

  // 在 App 内预览小组件：调用系统预览（会真实运行 widget.tsx 并拉取最新数据）
  async function handlePreview() {
    try {
      setPreviewMsg(null)
      await Widget.preview({ family: previewFamily as "systemSmall" | "systemMedium" | "systemLarge" })
    } catch (e) {
      setPreviewMsg(`预览失败：${(e as Error)?.message ?? String(e)}`)
    }
  }

  // 派生数据
  const merged = keyList.length > 0 ? mergeAll(keyList) : null
  const current =
    selectedKeyId === ALL_KEY_ID
      ? merged
      : keyList.find(k => k.id === selectedKeyId) ?? merged
  const window = usageWindow(periodDays)
  const daily = current ? dailySeries(current, window.start, window.end) : []
  const selectedUsageInfo = selectedUsageDay
    ? (daily.find(d => dayLabel(d.time) === selectedUsageDay) ?? null)
    : null
  const selectedCostInfo = selectedCostDay
    ? (daily.find(d => dayLabel(d.time) === selectedCostDay) ?? null)
    : null

  // 图表数据：bar/line 用当前 Key 的每日数据；stack 按 Key 分组展示同一天各 Key 的占比
  const usageMarks = daily.map(d => ({
    label: dayLabel(d.time),
    value: totalTokens(d.metrics) / 1e6,
  }))
  const costMarks = daily.map(d => ({ label: dayLabel(d.time), value: d.cost }))
  const stackKeys =
    selectedKeyId === ALL_KEY_ID
      ? keyList
      : keyList.filter(k => k.id === selectedKeyId)
  const usageStack = stackMarks(
    stackKeys,
    window.start,
    window.end,
    (k, t) => totalTokens(k.days.get(t) ?? emptyMetrics()) / 1e6
  )
  const costStack = stackMarks(
    stackKeys,
    window.start,
    window.end,
    (k, t) => k.costDays.get(t) ?? 0
  )

  const keyOptions = [
    { id: ALL_KEY_ID, label: "所有 Key", sub: keyList.length > 0 ? `共 ${keyList.length} 个` : "" },
    ...keyList.map(k => ({ id: k.id, label: k.name, sub: k.sensitiveId })),
  ]

  return (
    <NavigationStack>
      <List
        navigationTitle="DeepSeek 用量"
        navigationBarTitleDisplayMode="inline"
        toolbar={
          <Toolbar>
            <ToolbarItem placement="topBarLeading">
              <Button title="关闭" action={() => dismiss()} />
            </ToolbarItem>
            <ToolbarItem placement="topBarTrailing">
              <Button title="设置" systemImage="gearshape" action={() => setShowSettings(true)} />
            </ToolbarItem>
          </Toolbar>
        }
        sheet={{
          isPresented: showSettings,
          onChanged: setShowSettings,
          content: (
            <SettingsView
              savedKeys={savedKeys ?? []}
              onSave={handleAddKey}
              onDelete={handleDeleteKey}
              onClose={() => setShowSettings(false)}
            />
          ),
        }}
        refreshable={async () => {
          if (savedKeys) await load(savedKeys, periodDays)
        }}
      >
        <Section
          header={<Text>小组件预览</Text>}
          footer={<Text>在 App 内预览小组件效果，不会添加到桌面</Text>}
        >
          <Picker value={previewFamily} onChanged={setPreviewFamily} pickerStyle="segmented" title="尺寸">
            <Text tag="systemSmall">小</Text>
            <Text tag="systemMedium">中</Text>
            <Text tag="systemLarge">大</Text>
          </Picker>
          <Button title="预览小组件" action={handlePreview} />
          {previewMsg ? <Text>{previewMsg}</Text> : null}
        </Section>

        {savedKeys === null ? (
          <Section>
            <HStack spacing={8}>
              <ProgressView />
              <Text>加载中…</Text>
            </HStack>
          </Section>
        ) : savedKeys.length === 0 ? (
          <Section>
            <VStack spacing={12}>
              <Text>尚未配置 DeepSeek Key</Text>
              <Text>点击右上角 ⚙️ 粘贴你的平台 Bearer Token 即可查看用量</Text>
              <Button title="去添加 Key" action={() => setShowSettings(true)} />
            </VStack>
          </Section>
        ) : (
          <>
            {summary ? (
              <Section header={<Text>账户概览</Text>}>
                <HStack>
                  <Text>账户余额</Text>
                  <Spacer />
                  <Text>{formatMoney(summary.balance + summary.bonusBalance)}</Text>
                </HStack>
                <HStack>
                  <Text>累计消费</Text>
                  <Spacer />
                  <Text>{formatMoney(summary.totalCost)}</Text>
                </HStack>
              </Section>
            ) : null}

            <Section header={<Text>筛选</Text>}>
              <Picker
                value={periodDays}
                onChanged={setPeriodDays}
                pickerStyle="menu"
                title="时间范围"
              >
                <Text tag={7}>最近 7 天</Text>
                <Text tag={30}>最近 30 天</Text>
              </Picker>
              <Picker
                value={selectedKeyId}
                onChanged={setSelectedKeyId}
                pickerStyle="menu"
                title="API Key"
              >
                {keyOptions.map(o => (
                  <Text key={o.id} tag={o.id}>
                    {o.label}
                  </Text>
                ))}
              </Picker>
            </Section>

            {loading && !current ? (
              <Section>
                <HStack spacing={8}>
                  <ProgressView />
                  <Text>正在获取用量…</Text>
                </HStack>
              </Section>
            ) : null}

            {error ? (
              <Section>
                <HStack spacing={8}>
                  <Text>{error}</Text>
                  <Spacer />
                  <Button title="重试" action={() => savedKeys && load(savedKeys, periodDays)} />
                </HStack>
              </Section>
            ) : null}

            {current ? (
              <>
                <Section
                  header={<Text>用量汇总</Text>}
                  footer={updatedAt ? <Text>更新于 {timeLabel(updatedAt)}</Text> : undefined}
                >
                  <HStack>
                    <Text>请求次数</Text>
                    <Spacer />
                    <Text>{formatNumber(current.total.REQUEST)}</Text>
                  </HStack>
                  <HStack>
                    <Text>输出 Tokens</Text>
                    <Spacer />
                    <Text>{formatNumber(current.total.RESPONSE_TOKEN)}</Text>
                  </HStack>
                  <HStack>
                    <Text>输入 Tokens（缓存命中）</Text>
                    <Spacer />
                    <Text>{formatNumber(current.total.PROMPT_CACHE_HIT_TOKEN)}</Text>
                  </HStack>
                  <HStack>
                    <Text>输入 Tokens（未命中）</Text>
                    <Spacer />
                    <Text>{formatNumber(current.total.PROMPT_CACHE_MISS_TOKEN)}</Text>
                  </HStack>
                  <HStack>
                    <Text>总 Tokens</Text>
                    <Spacer />
                    <Text>{formatNumber(totalTokens(current.total))}</Text>
                  </HStack>
                  <HStack>
                    <Text>消费金额</Text>
                    <Spacer />
                    <Text>{formatMoney(current.totalCost)}</Text>
                  </HStack>
                  <HStack>
                    <Text>缓存命中率</Text>
                    <Spacer />
                    <Text>{cacheHitRate(current.total).toFixed(1)}%</Text>
                  </HStack>
                </Section>

                <Section
                  header={
                    <HStack>
                      <Text>每日用量（总 Tokens，单位 M）</Text>
                      <Spacer />
                      <ChartTypeMenu value={usageChartKind} onChanged={setUsageChartKind} />
                    </HStack>
                  }
                >
                  {usageChartKind === "line" ? (
                    <TrendChart
                      marks={usageMarks}
                      height={180}
                      lineColor="#2563EB"
                      gradient={["#8AB4FF", "rgba(138,180,255,0)"]}
                      valueFormatter={v =>
                        `${v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)}M`
                      }
                      selection={{
                        valueType: "string",
                        value: selectedUsageDay,
                        onChanged: (v: string | undefined | null) => {
                          setSelectedUsageDay(v ?? null)
                          setSelectedCostDay(null)
                        },
                      }}
                    />
                  ) : (
                    <Chart
                      frame={{ height: 180 }}
                      chartLegend={usageChartKind === "stack" ? "hidden" : undefined}
                      chartForegroundStyleScale={stackColorScale(stackKeys)}
                      chartYAxis={{
                        valueLabel: {
                          format: ChartAxisLabelFormat.number({ fractionDigits: 1 }),
                        },
                      }}
                      chartYAxisLabel={{ content: <Text>Tokens (M)</Text> }}
                    >
                      {usageChartKind === "bar" ? (
                        <BarChart
                          marks={styleBarMarks(
                            usageMarks,
                            "#2563EB",
                            "#1E40AF",
                            v =>
                              v >= 10
                                ? v.toFixed(0)
                                : v >= 1
                                  ? v.toFixed(1)
                                  : v.toFixed(2),
                            selectedUsageDay
                          )}
                        />
                      ) : null}
                      {usageChartKind === "stack" ? (
                        <BarStackChart
                          marks={styleStackMarks(usageStack)}
                        />
                      ) : null}
                      {usageChartKind === "bar" ? (
                        <ChartGesture>
                          {(proxy) =>
                            DragGesture({ minDistance: 0 })
                              .onEnded(v => {
                                const dx = Math.abs(v.translation.width)
                                const dy = Math.abs(v.translation.height)
                                if (dx > 24 || dy > 24) return // 视为滚动/拖动，不选
                                const label = proxy.value({ atX: v.location.x, as: "string" })
                                if (label != null) {
                                  setSelectedUsageDay(String(label))
                                  setSelectedCostDay(null)
                                }
                              })
                          }
                        </ChartGesture>
                      ) : null}
                    </Chart>
                  )}
                  {usageChartKind === "stack" ? <StackLegend keys={stackKeys} /> : null}
                  {selectedUsageInfo ? (
                    <DayDetail day={selectedUsageInfo} onClear={() => setSelectedUsageDay(null)} />
                  ) : null}
                </Section>

                <Section
                  header={
                    <HStack>
                      <Text>每日消费金额</Text>
                      <Spacer />
                      <ChartTypeMenu value={costChartKind} onChanged={setCostChartKind} />
                    </HStack>
                  }
                >
                  {costChartKind === "line" ? (
                    <TrendChart
                      marks={costMarks}
                      height={160}
                      lineColor="#F59E0B"
                      gradient={["#FCD34D", "rgba(252,211,77,0)"]}
                      valueFormatter={v => formatMoney(v)}
                      selection={{
                        valueType: "string",
                        value: selectedCostDay,
                        onChanged: (v: string | undefined | null) => {
                          setSelectedCostDay(v ?? null)
                          setSelectedUsageDay(null)
                        },
                      }}
                    />
                  ) : (
                    <Chart
                      frame={{ height: 160 }}
                      chartLegend={costChartKind === "stack" ? "hidden" : undefined}
                      chartForegroundStyleScale={stackColorScale(stackKeys)}
                      chartYAxis={{
                        valueLabel: {
                          format: ChartAxisLabelFormat.currency({ currencyCode: "CNY", fractionDigits: 2 }),
                        },
                      }}
                      chartYAxisLabel={{ content: <Text>金额 (¥)</Text> }}
                    >
                      {costChartKind === "bar" ? (
                        <BarChart
                          marks={styleBarMarks(
                            costMarks,
                            "#F59E0B",
                            "#B45309",
                            v => formatMoney(v),
                            selectedCostDay
                          )}
                        />
                      ) : null}
                      {costChartKind === "stack" ? (
                        <BarStackChart
                          marks={styleStackMarks(costStack)}
                        />
                      ) : null}
                      {costChartKind === "bar" ? (
                        <ChartGesture>
                          {(proxy) =>
                            DragGesture({ minDistance: 0 })
                              .onEnded(v => {
                                const dx = Math.abs(v.translation.width)
                                const dy = Math.abs(v.translation.height)
                                if (dx > 24 || dy > 24) return // 视为滚动/拖动，不选
                                const label = proxy.value({ atX: v.location.x, as: "string" })
                                if (label != null) {
                                  setSelectedCostDay(String(label))
                                  setSelectedUsageDay(null)
                                }
                              })
                          }
                        </ChartGesture>
                      ) : null}
                    </Chart>
                  )}
                  {costChartKind === "stack" ? <StackLegend keys={stackKeys} /> : null}
                  {selectedCostInfo ? (
                    <DayDetail day={selectedCostInfo} onClear={() => setSelectedCostDay(null)} />
                  ) : null}
                </Section>

                <Section header={<Text>每日明细</Text>}>
                  {[...daily].reverse().map(d => (
                    <HStack key={d.time} spacing={8}>
                      <Text>{dayLabel(d.time)}</Text>
                      <Spacer />
                      <Text>{formatNumber(d.metrics.REQUEST)} 次</Text>
                      <Text>{formatCompact(totalTokens(d.metrics))} Tokens</Text>
                      <Text>{formatMoney(d.cost)}</Text>
                    </HStack>
                  ))}
                </Section>
              </>
            ) : null}
          </>
        )}
      </List>
    </NavigationStack>
  )
}

async function run() {
  await Navigation.present(<MainView />)
  Script.exit()
}

run()
