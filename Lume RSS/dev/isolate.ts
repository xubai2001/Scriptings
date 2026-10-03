/**
 * 开发脚本专用：隔离数据目录 + 禁止写入。
 *
 * 必须作为 **第一个 import** 出现在 dev/ 下的脚本里，例如：
 *   import "./isolate"
 *   import { store } from "../lib/store"
 * 这样 lib/persist.ts 在初始化时就能看到这两个全局标记。
 *
 * 教训：预览脚本曾经直接用 App Group 下的 lume/ 目录，flush 时把示例订阅和示例文章
 * 写进了用户的真实数据（用户莫名其妙多出一个 The Verge 订阅）。别删这两行。
 */

const scope = globalThis as { __LUME_DATA_DIR__?: string; __LUME_NO_WRITE__?: boolean }

scope.__LUME_DATA_DIR__ = FileManager.appGroupDocumentsDirectory + "/lume-dev"
// 预览只读：即使目录写错也不会污染真实数据
scope.__LUME_NO_WRITE__ = true

console.log("[dev] 数据目录隔离到 lume-dev/，且已禁用写入")
