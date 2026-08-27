import { fetch } from "scripting"

// DeepSeek 用量：类型定义、API 请求、数据聚合、本地存储与格式化工具。

export const TZ_OFFSET = 28800 // 时区偏移（秒），UTC+8

export type UsageMetrics = {
  REQUEST: number
  RESPONSE_TOKEN: number
  PROMPT_CACHE_HIT_TOKEN: number
  PROMPT_CACHE_MISS_TOKEN: number
}

export type UsageBucket = {
  time: number // 当日零点（unix 秒）
  usage: UsageMetrics
}

export type UsageSeries = {
  api_key: {
    tracking_id: string
    name: string
    sensitive_id: string
    valid: boolean
  }
  model: string
  buckets: UsageBucket[]
}

/** 按天消费金额（by_api_key/cost 接口返回，cost 为字符串金额）。 */
export type CostSeries = {
  api_key: {
    tracking_id: string
    name: string
    sensitive_id: string
    valid: boolean
  }
  model: string
  buckets: { time: number; cost: number }[]
}

/** 账户概览（get_user_summary 接口）：余额与累计消费。 */
export type UserSummary = {
  currency: string
  balance: number // 正常余额
  bonusBalance: number // 赠送余额
  totalCost: number // 累计消费
}

export type SavedKey = {
  id: string
  token: string
  createdAt: number
}

export type KeyUsage = {
  id: string // tracking_id，跨账号唯一
  name: string
  sensitiveId: string
  days: Map<number, UsageMetrics>
  total: UsageMetrics
  costDays: Map<number, number> // 每天消费金额（CNY）
  totalCost: number // 窗口内累计消费
}

const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1"

// ── 基础工具 ─────────────────────────────────────────────────────────────────

export function emptyMetrics(): UsageMetrics {
  return { REQUEST: 0, RESPONSE_TOKEN: 0, PROMPT_CACHE_HIT_TOKEN: 0, PROMPT_CACHE_MISS_TOKEN: 0 }
}

export function addMetrics(a: UsageMetrics, b: UsageMetrics) {
  a.REQUEST += b.REQUEST
  a.RESPONSE_TOKEN += b.RESPONSE_TOKEN
  a.PROMPT_CACHE_HIT_TOKEN += b.PROMPT_CACHE_HIT_TOKEN
  a.PROMPT_CACHE_MISS_TOKEN += b.PROMPT_CACHE_MISS_TOKEN
}

export function totalTokens(m: UsageMetrics): number {
  return m.RESPONSE_TOKEN + m.PROMPT_CACHE_HIT_TOKEN + m.PROMPT_CACHE_MISS_TOKEN
}

export function cacheHitRate(m: UsageMetrics): number {
  const total = m.PROMPT_CACHE_HIT_TOKEN + m.PROMPT_CACHE_MISS_TOKEN
  return total === 0 ? 0 : (m.PROMPT_CACHE_HIT_TOKEN / total) * 100
}

// ── 时间窗口 ─────────────────────────────────────────────────────────────────

export type UsagePeriodDays = 7 | 30

const USAGE_PERIOD_PATH = FileManager.appGroupDocumentsDirectory + "/deepseek_usage_period.json"

export function readUsagePeriodDays(): UsagePeriodDays {
  try {
    if (!FileManager.existsSync(USAGE_PERIOD_PATH)) return 7
    return FileManager.readAsStringSync(USAGE_PERIOD_PATH).trim() === "30" ? 30 : 7
  } catch {
    return 7
  }
}

export function saveUsagePeriodDays(days: number): void {
  try {
    FileManager.writeAsStringSync(USAGE_PERIOD_PATH, days === 30 ? "30" : "7")
  } catch (e) {
    console.log("保存时间范围失败", e)
  }
}

export function dayStart(ts: number): number {
  return Math.floor((ts + TZ_OFFSET) / 86400) * 86400 - TZ_OFFSET
}

export function usageWindow(days: number): { start: number; end: number } {
  const today = dayStart(Date.now() / 1000)
  return { start: today - (days - 1) * 86400, end: today + 86400 }
}

export function dailySeries(
  info: KeyUsage,
  start: number,
  end: number
): { time: number; metrics: UsageMetrics; cost: number }[] {
  const out: { time: number; metrics: UsageMetrics; cost: number }[] = []
  for (let t = start; t < end; t += 86400) {
    out.push({
      time: t,
      metrics: info.days.get(t) ?? emptyMetrics(),
      cost: info.costDays.get(t) ?? 0,
    })
  }
  return out
}

// ── API 请求 ─────────────────────────────────────────────────────────────────

export async function fetchUsage(token: string, start: number, end: number): Promise<UsageSeries[]> {
  const url = `https://platform.deepseek.com/api/v0/usage/by_api_key/amount?start=${start}&end=${end}&tz=${TZ_OFFSET}`
  const res = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      referer: "https://platform.deepseek.com/usage",
      "user-agent": USER_AGENT,
      accept: "*/*",
    },
    timeout: 30,
    debugLabel: "deepseek-usage",
  })
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error("请求被拦截，请确认 Key 有效（需为平台 usage 页的 Bearer Token）")
  }
  if (!res.ok) {
    throw new Error(`请求失败 (HTTP ${res.status})`)
  }
  if (!json || json.code !== 0) {
    throw new Error(json?.msg || json?.biz_msg || "接口返回异常")
  }
  const biz = json.data?.biz_data
  if (!biz || !Array.isArray(biz.series)) {
    throw new Error("接口返回格式异常")
  }
  return biz.series as UsageSeries[]
}

/** 按天消费金额：biz_data.data[]（按币种）→ 拍平成 series。 */
export async function fetchCost(token: string, start: number, end: number): Promise<CostSeries[]> {
  const url = `https://platform.deepseek.com/api/v0/usage/by_api_key/cost?start=${start}&end=${end}&tz=${TZ_OFFSET}`
  const res = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      referer: "https://platform.deepseek.com/usage",
      "user-agent": USER_AGENT,
      accept: "*/*",
    },
    timeout: 30,
    debugLabel: "deepseek-cost",
  })
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error("请求被拦截，请确认 Key 有效（需为平台 usage 页的 Bearer Token）")
  }
  if (!res.ok) {
    throw new Error(`请求失败 (HTTP ${res.status})`)
  }
  if (!json || json.code !== 0) {
    throw new Error(json?.msg || json?.biz_msg || "接口返回异常")
  }
  const biz = json.data?.biz_data
  if (!biz || !Array.isArray(biz.data)) {
    throw new Error("接口返回格式异常")
  }
  const out: CostSeries[] = []
  for (const cur of biz.data) {
    if (Array.isArray(cur?.series)) {
      for (const s of cur.series) {
        out.push({
          ...s,
          buckets: (s.buckets ?? []).map((b: any) => ({
            time: b.time,
            cost: typeof b.cost === "string" ? parseFloat(b.cost) : Number(b.cost) || 0,
          })),
        })
      }
    }
  }
  return out
}

/** 账户概览：余额（正常 + 赠送）与累计消费。 */
export async function fetchSummary(token: string): Promise<UserSummary> {
  const url = "https://platform.deepseek.com/api/v0/users/get_user_summary"
  const res = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      referer: "https://platform.deepseek.com/usage",
      "user-agent": USER_AGENT,
      accept: "*/*",
    },
    timeout: 30,
    debugLabel: "deepseek-summary",
  })
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error("请求被拦截，请确认 Key 有效（需为平台 usage 页的 Bearer Token）")
  }
  if (!res.ok) {
    throw new Error(`请求失败 (HTTP ${res.status})`)
  }
  if (!json || json.code !== 0) {
    throw new Error(json?.msg || json?.biz_msg || "接口返回异常")
  }
  const biz = json.data?.biz_data
  const pick = (arr: any[] | undefined) => {
    if (!Array.isArray(arr) || arr.length === 0) return 0
    return parseFloat(arr[0].balance) || 0
  }
  const normal = Array.isArray(biz?.normal_wallets) ? biz.normal_wallets : []
  const bonus = Array.isArray(biz?.bonus_wallets) ? biz.bonus_wallets : []
  const costs = Array.isArray(biz?.total_costs) ? biz.total_costs : []
  const currency = normal[0]?.currency || costs[0]?.currency || "CNY"
  return {
    currency,
    balance: pick(normal),
    bonusBalance: pick(bonus),
    totalCost: costs.length > 0 ? parseFloat(costs[0].amount) || 0 : 0,
  }
}

/** 手动实现 Promise.allSettled，保证兼容性。 */
export async function settle<T>(
  promises: Promise<T>[]
): Promise<{ ok: boolean; value?: T; error?: string }[]> {
  const results: { ok: boolean; value?: T; error?: string }[] = []
  for (const p of promises) {
    try {
      results.push({ ok: true, value: await p })
    } catch (e) {
      results.push({ ok: false, error: (e as Error)?.message ?? String(e) })
    }
  }
  return results
}

// ── 数据聚合 ─────────────────────────────────────────────────────────────────

/** 把多账号多次请求的 series 汇总成按 tracking_id 去重的 KeyUsage 列表（跨模型累加）。 */
export function aggregate(seriesList: UsageSeries[][]): KeyUsage[] {
  const map = new Map<string, KeyUsage>()
  for (const series of seriesList) {
    for (const s of series) {
      const key = s.api_key
      let k = map.get(key.tracking_id)
      if (!k) {
        k = {
          id: key.tracking_id,
          name: key.name || "未命名",
          sensitiveId: key.sensitive_id || "",
          days: new Map(),
          total: emptyMetrics(),
          costDays: new Map(),
          totalCost: 0,
        }
        map.set(key.tracking_id, k)
      }
      for (const b of s.buckets) {
        let day = k.days.get(b.time)
        if (!day) {
          day = emptyMetrics()
          k.days.set(b.time, day)
        }
        addMetrics(day, b.usage)
        addMetrics(k.total, b.usage)
      }
    }
  }
  return [...map.values()]
}

/** 把 by_api_key/cost 返回的金额合并进已聚合的 KeyUsage（按 tracking_id 匹配）。 */
export function applyCost(keys: KeyUsage[], costSeriesList: CostSeries[][]): void {
  const byId = new Map(keys.map(k => [k.id, k]))
  for (const seriesList of costSeriesList) {
    for (const s of seriesList) {
      const k = byId.get(s.api_key.tracking_id)
      if (!k) continue
      for (const b of s.buckets) {
        if (!b.cost) continue
        const prev = k.costDays.get(b.time) ?? 0
        k.costDays.set(b.time, prev + b.cost)
        k.totalCost += b.cost
      }
    }
  }
}

/** 把所有 Key 合并成一个（用于"所有 Key"视图）。 */
export function mergeAll(keys: KeyUsage[]): KeyUsage {
  const merged: KeyUsage = {
    id: "__all__",
    name: "所有 Key",
    sensitiveId: "",
    days: new Map(),
    total: emptyMetrics(),
    costDays: new Map(),
    totalCost: 0,
  }
  for (const k of keys) {
    addMetrics(merged.total, k.total)
    for (const [t, m] of k.days) {
      let day = merged.days.get(t)
      if (!day) {
        day = emptyMetrics()
        merged.days.set(t, day)
      }
      addMetrics(day, m)
    }
    merged.totalCost += k.totalCost
    for (const [t, c] of k.costDays) {
      merged.costDays.set(t, (merged.costDays.get(t) ?? 0) + c)
    }
  }
  return merged
}

// ── 本地存储（Key 保存在 App Group 目录，不同步 iCloud） ──────────────────────

const STORE_PATH = FileManager.appGroupDocumentsDirectory + "/deepseek_usage_keys.json"

export function loadSavedKeys(): SavedKey[] {
  try {
    if (!FileManager.existsSync(STORE_PATH)) return []
    const obj = JSON.parse(FileManager.readAsStringSync(STORE_PATH))
    if (Array.isArray(obj?.keys)) {
      return obj.keys.filter(
        (k: any) => k && typeof k.token === "string" && k.token.trim().length > 0
      )
    }
  } catch {
    // 忽略读取错误
  }
  return []
}

export function saveSavedKeys(keys: SavedKey[]): void {
  try {
    FileManager.writeAsStringSync(STORE_PATH, JSON.stringify({ keys }))
  } catch (e) {
    console.log("保存 Key 失败", e)
  }
}

// ── 格式化 ───────────────────────────────────────────────────────────────────

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0"
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function trimZeros(s: string): string {
  const v = s.replace(/\.?0+$/, "")
  return v === "" || v === "-" ? "0" : v
}

export function formatCompact(n: number): string {
  if (n >= 1e8) return trimZeros((n / 1e8).toFixed(2)) + " 亿"
  if (n >= 1e4) return trimZeros((n / 1e4).toFixed(2)) + " 万"
  if (n >= 1e3) return trimZeros((n / 1e3).toFixed(1)) + "k"
  return String(Math.round(n))
}

/** 金额格式化：¥ 前缀；极小金额保留更多小数，避免显示 ¥0.00。 */
export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "¥0"
  if (n !== 0 && Math.abs(n) < 0.01) {
    return "¥" + trimZeros(n.toFixed(4))
  }
  return "¥" + trimZeros(n.toFixed(2))
}

/** 按 UTC+8 显示日期，如 8/14。 */
export function dayLabel(ts: number): string {
  const d = new Date((ts + TZ_OFFSET) * 1000)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

export function maskToken(token: string): string {
  if (token.length <= 12) return token
  return token.slice(0, 8) + "…" + token.slice(-6)
}
