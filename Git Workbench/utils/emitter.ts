/** 极简订阅器：页面之外的模块级状态变化用它广播，视图用 hooks.ts 订阅 */
export class Emitter<T = void> {
  private listeners: ((value: T) => void)[] = []

  subscribe(listener: (value: T) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const idx = this.listeners.indexOf(listener)
      if (idx !== -1) this.listeners.splice(idx, 1)
    }
  }

  emit(value: T): void {
    this.listeners.slice().forEach(listener => {
      try {
        listener(value)
      } catch (e) {
        console.log("emitter listener error", String(e))
      }
    })
  }
}

export const emitters = {
  settings: new Emitter<void>(),
  favorites: new Emitter<void>(),
  recent: new Emitter<void>(),
  activity: new Emitter<void>(),
  drafts: new Emitter<string>(),
  repositories: new Emitter<void>(),
  gists: new Emitter<void>(),
  account: new Emitter<void>(),
}
