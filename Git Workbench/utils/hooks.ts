/** React 侧的小工具 hooks */

import { useEffect, useState } from "scripting"
import { Emitter } from "./emitter"

/** 订阅一个或多个 Emitter，返回一个变化的版本号用于触发重渲染 */
export function useWatch(...sources: Emitter<any>[]): number {
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const unsubscribers = sources.map(source => source.subscribe(() => setRevision(Date.now())))
    return () => unsubscribers.forEach(unsubscribe => unsubscribe())
  }, [])
  return revision
}

/** 从任意来源取值的订阅包装：值变化时自动重渲染 */
export function useStoreValue<T>(sources: Emitter<any>[], getter: () => T): T {
  useWatch(...sources)
  return getter()
}

/** 只在依赖变化时执行的异步初始化 */
export function useAsyncEffect(run: () => Promise<void>, deps: any[]): void {
  useEffect(() => {
    let cancelled = false
    run().catch(e => {
      if (!cancelled) console.log("async effect error", String(e))
    })
    return () => {
      cancelled = true
    }
  }, deps)
}
