import {
  Widget,
  VStack,
  HStack,
  Text,
  Spacer,
  Button,
  Link,
  SVG,
  Path,
  Chart,
  ChartPlotStyle,
  BarChart,
  LineChart,
  AreaChart,
  Script,
  Color,
} from "scripting"
import { RefreshBalanceIntent, SetChartModeIntent } from "./app_intents"
import {
  USAGE_URL,
  WidgetSnapshot,
  ChartMode,
  readWidgetCache,
  readChartMode,
  fetchWidgetSnapshot,
  saveWidgetCache,
  DEEPSEEK_LOGO_SVG,
  formatBalanceNum,
  widgetTimeLabel,
} from "./widget_data"
import { loadSavedKeys, formatMoney, formatCompact, dayLabel } from "./usage"

// DeepSeek 用量小组件：small（余额）/ medium（余额 + 近7天余额走势图）/ large（完整看板）。
// 顶部 logo 点击跳转平台用量页；余额点击刷新余额（AppIntent）。

const RELOAD_MS = 15 * 60 * 1000 // 每 15 分钟请求一次新时间线

// ── 公共组件 ─────────────────────────────────────────────────────────────────

/** 左上角 logo：api-balance 同款 DeepSeek.svg（图标+文字合一），code 内嵌渲染，整体点击跳转平台用量页。 */
function LogoHeader({ height = 28 }: { height?: number }) {
  return (
    <Link url={USAGE_URL}>
      <SVG
        code={DEEPSEEK_LOGO_SVG}
        scaleToFit
        resizable
        antialiased={true}
        frame={{ height }}
        renderingMode="template"
        foregroundStyle="#4D6BFE"
      />
    </Link>
  )
}

/** 大号余额：小 ¥ 符号 + 大号数字，数字用等宽字体。 */
function BalanceNumber({ balance, size = 30 }: { balance: number; size?: number }) {
  const symSize = Math.round(size * 0.52)
  return (
    <HStack spacing={2} alignment="lastTextBaseline">
      <Text font={symSize} fontWeight="semibold">
        ¥
      </Text>
      <Text
        font={size}
        fontWeight="bold"

     //   monospacedDigit
        lineLimit={1}
        minScaleFactor={0.6}
        widgetAccentable
      >
        {formatBalanceNum(balance)}
      </Text>
    </HStack>
  )
}

/** 余额可点击区域：有数据时显示余额，无数据时显示错误提示；点击都会触发刷新。 */
function BalanceButton({ data, error, size }: { data: WidgetSnapshot; error: string | null; size: number }) {
  const hasData = data.updatedAt > 0
  return (
    <Button intent={RefreshBalanceIntent(undefined)} buttonStyle="plain">
      {hasData ? (
        <BalanceNumber balance={data.balance + data.bonusBalance} size={size} />
      ) : (
        <Text
          font={Math.round(size * 0.45)}
          fontWeight="semibold"

          lineLimit={2}
          minScaleFactor={0.6}
        >
          {error ?? "点击刷新"}
        </Text>
      )}
    </Button>
  )
}

function UpdatedAt({ data }: { data: WidgetSnapshot }) {
  return (
    <HStack>
      {/*<Spacer />*/}
      <Text font={9} foregroundStyle="secondaryLabel">
        更新于 {data.updatedAt > 0 ? widgetTimeLabel(data.updatedAt) : "--:--"}
      </Text>
      {/*<Spacer />*/}
    </HStack>
  )
}

/** 通用趋势图：平滑折线 + 面积渐变 + 日期刻度（medium/large 复用）。
 * 坐标轴用系统自动轴（不传 chartYAxis/chartYScale），显式 chartXAxis 钉首/中/今三个日期刻度。
 * 余额/Token 两种数据都走这个组件，仅颜色与 marks 不同。 */
function TrendChart({
  marks,
  height,
  lineColor,
  gradient,
}: {
  marks: { label: string; value: number }[]
  height: number
  lineColor: Color
  gradient: [Color, Color]
}) {
  if (marks.length === 0) {
    return (
      <HStack>
        <Spacer />
        <Text font={10} foregroundStyle="secondaryLabel">
          暂无用量数据
        </Text>
        <Spacer />
      </HStack>
    )
  }
  return (
    <Chart frame={{ height }}
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
          // 想显示真正的日期文字就去掉 content；想保留自定义样式可留 content
        },
      }}
      // chartYScale={{ domain: { from: 10, to: 30 }, type: "linear" }}
    >
      <AreaChart
        marks={marks.map(m => ({
          ...m,
          interpolationMethod: "catmullRom",
          // 官方 Multiple Charts 示例写法：两段颜色数组 = 实色→透明渐变（首色在折线处，末色在横轴处）
          foregroundStyle: gradient,
        }))}

      />
      <LineChart
        marks={marks.map(m => ({
          ...m,
          interpolationMethod: "catmullRom",
          foregroundStyle: lineColor,
          lineStyle: { lineWidth: 2, lineCap: "round", lineJoin: "round" },

        }))}

      />
      <ChartPlotStyle>
          {(plot) => plot.clipShape("rect")}
        </ChartPlotStyle>
    </Chart>
  )
}

/** 近 7 天余额走势（余额模式）：平滑折线（#2563EB）+ 面积渐变（#8AB4FF 向下渐隐）。
 * 余额无历史接口，按每日消费回推：当日余额 ≈ 当前余额 + 当日之后各天消费之和（假设窗口内无充值）。 */
function BalanceTrendChart({
  daily,
  balance,
  height,
}: {
  daily: WidgetSnapshot["daily"]
  balance: number
  height: number
}) {
  // 从最新一天往前回推：after = 该日之后各天的消费总和
  let after = daily.reduce((s, d) => s + d.cost, 0)
  const marks = daily.map(d => {
    after -= d.cost
    return {
      label: dayLabel(d.time),
      value: Math.round((balance + after) * 100) / 100,
    }
  })
  return (
    <TrendChart
      marks={marks}
      height={height}
      lineColor="#2563EB"
      gradient={["#8AB4FF", "rgba(138,180,255,0)"]}
    />
  )
}

/** 近 7 天 Token 用量（Token 模式）：直接绘制每日总 Tokens，绿色系与余额区分。
 * 数值换算成 M（百万）单位绘制，纵轴自动刻度即小数，避免大数字变成科学计数法（xEx）。 */
function TokenTrendChart({
  daily,
  height,
}: {
  daily: WidgetSnapshot["daily"]
  height: number
}) {
  const marks = daily.map(d => ({
    label: dayLabel(d.time),
    value: Math.round((d.tokens / 1e6) * 100) / 100,
  }))
  return (
    <TrendChart
      marks={marks}
      height={height}
      lineColor="#10B981"
      gradient={["#6EE7B7", "rgba(110,231,183,0)"]}
    />
  )
}

/** 图表模式切换（余额 / Token 用量）：两个小胶囊按钮，点击写入模式并重载小组件。 */
function ChartModeSwitch({ mode }: { mode: ChartMode }) {
  const chip = (m: ChartMode, label: string, activeColor: Color) => {
    const active = mode === m
    return (
      <Button intent={SetChartModeIntent(m)} buttonStyle="plain">
        <Text
          font={9}
          fontWeight={active ? "semibold" : "regular"}
          foregroundStyle={active ? "#FFFFFF" : "secondaryLabel"}
          padding={{ horizontal: 7, vertical: 3 }}
          background={active ? activeColor : "clear"}
          clipShape={{ type: "rect", cornerRadius: 6, style: "continuous" }}
        >
          {label}
        </Text>
      </Button>
    )
  }
  return (
    <HStack spacing={2}>
      {chip("balance", "余额", "#2563EB")}
      {chip("tokens", "Token", "#10B981")}
    </HStack>
  )
}

// ── small：余额 ──────────────────────────────────────────────────────────────

function SmallView({ data, error }: { data: WidgetSnapshot; error: string | null }) {
  return (
    <VStack padding={14} spacing={0}>
      <HStack>
        <LogoHeader height={22} />
        <Spacer />
      </HStack>
      <Spacer />
      <HStack>
        <Spacer />
        <VStack spacing={2} alignment="leading">
          <Text font={12} fontWeight="semibold" foregroundStyle="secondaryLabel">
            余额(CNY)
          </Text>
          <BalanceButton data={data} error={error} size={35} />
        </VStack>
        <Spacer />
      </HStack>
      <Spacer />
      <UpdatedAt data={data} />
    </VStack>
  )
}

// ── medium：左侧账户信息 + 右侧图表（余额/Token 可切换） ──────────────────────

function MediumView({ data, error, mode }: { data: WidgetSnapshot; error: string | null; mode: ChartMode }) {
  return (
    <HStack padding={12} spacing={12} alignment="top">
      <VStack spacing={4} alignment="leading" frame={{ width: 112 }}>
        <LogoHeader height={22} />
        <Text font={11} fontWeight="semibold" foregroundStyle="secondaryLabel">
          账户余额
        </Text>
        <BalanceButton data={data} error={error} size={34} />
        <Text font={10} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.7}>
          累计消费 {formatMoney(data.totalCost)}
        </Text>
        <Text font={10} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.7}>
          7天消耗 {formatMoney(data.weekCost)}
        </Text>
        <UpdatedAt data={data} />
      </VStack>

      <VStack spacing={3} alignment="leading">
        <Spacer />
        <HStack>
          <Text
            font={10}
            fontWeight="semibold"
            foregroundStyle="secondaryLabel"
            frame={{ maxWidth: "infinity", alignment: "center" }}
          >
            {mode === "balance" ? "近7天余额" : "近7天用量 (M)"}
          </Text>
          <ChartModeSwitch mode={mode} />
        </HStack>
        <Spacer />
        {mode === "balance" ? (
          <BalanceTrendChart
            daily={data.daily}
            balance={data.balance + data.bonusBalance}
            height={80}
          />
        ) : (
          <TokenTrendChart daily={data.daily} height={80} />
        )}
      </VStack>
    </HStack>
  )
}

// ── large：完整看板（余额 + 图表（余额/Token 可切换） + 每日明细） ───────────────

function LargeView({ data, error, mode }: { data: WidgetSnapshot; error: string | null; mode: ChartMode }) {
  return (
    <VStack padding={14} spacing={7}>
      <HStack>
        <LogoHeader height={28} />
        <Spacer />
      </HStack>

      <HStack spacing={16} >
        <VStack spacing={4} >
          <Text font={11} foregroundStyle="secondaryLabel">
            账户余额
          </Text>
          <BalanceButton data={data} error={error} size={40} />
          <Text font={11} foregroundStyle="secondaryLabel">
            累计消费 {formatMoney(data.totalCost)}
          </Text>
          <Text font={11} foregroundStyle="secondaryLabel">
            近7天消费 {formatMoney(data.weekCost)}
          </Text>
        </VStack>
        <VStack spacing={3} alignment="leading">
          <HStack>
            <Text
              font={10}
              fontWeight="semibold"
              foregroundStyle="secondaryLabel"
              frame={{ maxWidth: "infinity", alignment: "center" }}
            >
              {mode === "balance" ? "近7天余额" : "近7天用量 (M)"}
            </Text>
            <ChartModeSwitch mode={mode} />
          </HStack>
          <Spacer />
          {data.daily.length > 0 ? (
            mode === "balance" ? (
              <BalanceTrendChart
                daily={data.daily}
                balance={data.balance + data.bonusBalance}
                height={80}
              />
            ) : (
              <TokenTrendChart daily={data.daily} height={80} />
            )
          ) : (
            <HStack>
              <Spacer />
              <Text font={10} foregroundStyle="secondaryLabel">
                暂无用量数据
              </Text>
              <Spacer />
            </HStack>
          )}
        </VStack>
      </HStack>
      <Spacer />
      <HStack spacing={4}>
        <Text font={10} foregroundStyle="secondaryLabel" frame={{ width: 36, alignment: "leading" }}>
          日期
        </Text>
        <Spacer />
        <Text font={10} foregroundStyle="secondaryLabel">
          Tokens
        </Text>
        <Text font={10} foregroundStyle="secondaryLabel" frame={{ width: 62, alignment: "trailing" }}>
          消费
        </Text>
      </HStack>
      {[...data.daily].reverse().map(d => (
        <HStack key={d.time} spacing={4}>
          <Text font={10} frame={{ width: 36, alignment: "leading" }}>
            {dayLabel(d.time)}
          </Text>
          <Spacer />
          <Text font={10} foregroundStyle="secondaryLabel" monospacedDigit>
            {formatCompact(d.tokens)}
          </Text>
          <Text font={10} monospacedDigit frame={{ width: 62, alignment: "trailing" }}>
            {formatMoney(d.cost)}
          </Text>
        </HStack>
      ))}

      <Spacer />
      <UpdatedAt data={data} />
    </VStack>
  )
}

// ── 入口 ─────────────────────────────────────────────────────────────────────

export type PreviewFamily = "systemSmall" | "systemMedium" | "systemLarge"

export function WidgetView({ data, error, family, mode }: { data: WidgetSnapshot; error: string | null; family?: PreviewFamily; mode?: ChartMode }) {
  const fam = family ?? Widget.family
  const m = mode ?? readChartMode()
  if (fam === "systemMedium") return <MediumView data={data} error={error} mode={m} />
  if (fam === "systemLarge") return <LargeView data={data} error={error} mode={m} />
  return <SmallView data={data} error={error} />
}

function emptySnapshot(): WidgetSnapshot {
  return { updatedAt: 0, balance: 0, bonusBalance: 0, totalCost: 0, weekCost: 0, currency: "CNY", daily: [] }
}

async function run() {
  const keys = loadSavedKeys()
  const cached = readWidgetCache()
  let data = cached ?? emptySnapshot()
  let error: string | null = null

  if (keys.length > 0) {
    try {
      const fresh = await fetchWidgetSnapshot(keys)
      saveWidgetCache(fresh)
      data = fresh
    } catch (e) {
      error = (e as Error)?.message ?? "获取失败"
      if (!cached) data = emptySnapshot()
    }
  } else {
    error = "未配置 Key"
    if (!cached) data = emptySnapshot()
  }

  const mode = readChartMode()
  Widget.present(<WidgetView data={data} error={error} mode={mode} />, {
    reloadPolicy: { policy: "after", date: new Date(Date.now() + RELOAD_MS) },
  })
  Script.exit()
}

run()
