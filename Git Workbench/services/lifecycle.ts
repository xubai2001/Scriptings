/**
 * 应用生命周期标记：让「退出」按钮知道 present 是否已经被正常关闭。
 *
 * 退出流程：用户点 ✕ → Navigation.useDismiss()(true) → index.tsx 里
 * `await Navigation.present(...)` 拿到结果 → Script.exit()。
 * 如果 dismiss 因为某些原因没有生效（例如被包在多层容器里），
 * 这里用超时兜底强制退出，避免用户被困在页面里。
 */

import { Script } from "scripting"

export const appLifecycle: { exiting: boolean } = {
  exiting: false,
}

export function markExiting(): void {
  appLifecycle.exiting = true
}

/** 退出：先尝试走正常关闭流程，兜底再强制结束脚本实例 */
export function requestExit(dismiss: (result?: any) => void): void {
  try {
    dismiss(true)
  } catch (e) {
    console.log("dismiss failed, exiting directly", String(e))
  }
  setTimeout(() => {
    if (!appLifecycle.exiting) {
      Script.exit()
    }
  }, 700)
}
