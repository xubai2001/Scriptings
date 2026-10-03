/**
 * 字体设置分组预览：单独截图检查选择器、输入框与预览行。
 * 「标题字体」故意设成自定义字体族、「正文字体」故意设成系统衬线变体，
 * 这样一眼就能看出两种机制都生效。
 *
 * 注意：必须在模块顶层（首次渲染前）就改好 settings，
 * 放在 useEffect 里再改不会影响已完成的首次渲染。
 */

import "./isolate"
import { List, NavigationStack } from "scripting"
import { store } from "../lib/store"
import { FontSettingsSection } from "../ui/settings"

store.settings.titleFont = { design: "default", family: "Georgia" }
store.settings.bodyFont = { design: "serif", family: "" }
store.loaded = true

console.log("[preview] 标题字体 =", store.settings.titleFont, "正文字体 =", store.settings.bodyFont)

export default function View() {
  return (
    <NavigationStack>
      <List navigationTitle="字体" listStyle="insetGroup">
        <FontSettingsSection />
      </List>
    </NavigationStack>
  )
}
