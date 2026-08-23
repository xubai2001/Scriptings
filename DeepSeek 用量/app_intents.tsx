import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import { loadSavedKeys } from "./usage"
import { fetchWidgetSnapshot, saveWidgetCache, saveChartMode } from "./widget_data"

// DeepSeek 用量小组件的 AppIntent：点击余额区域时刷新余额并重载小组件。

export const RefreshBalanceIntent = AppIntentManager.register({
  name: "RefreshBalance",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    const keys = loadSavedKeys()
    if (keys.length > 0) {
      try {
        const snap = await fetchWidgetSnapshot(keys)
        saveWidgetCache(snap)
      } catch (e) {
        console.log("刷新余额失败", e)
      }
    }
    // 重载小组件，让 widget.tsx 以最新缓存重新渲染
    Widget.reloadAll()
  },
})

// 图表模式切换（余额 / Token 用量）：写入模式后重载小组件，让图表按新模式渲染。
export const SetChartModeIntent = AppIntentManager.register({
  name: "SetChartMode",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (mode: string) => {
    if (mode === "balance" || mode === "tokens") {
      saveChartMode(mode)
    }
    Widget.reloadAll()
  },
})
