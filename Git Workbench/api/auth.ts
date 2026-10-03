/**
 * 认证与多账户
 *
 * - 每个账户一份个人访问令牌（PAT），只存在 Keychain 里，绝不写入普通配置或日志。
 * - 每个脚本有独立 Keychain 作用域，令牌不会泄露给其他脚本。
 * - 账户资料（login / 昵称 / 头像地址等非敏感信息）存在 Storage；令牌按账户分别存 Keychain。
 * - active 指向当前使用的账户，所有网络请求都用它。
 */

import { Account, AccountStore } from "../types"

const ACCOUNTS_KEY = "gw.accounts"

/** 旧版本的单账户键，首次启动时自动迁移 */
const LEGACY_TOKEN_KEY = "gw.github.token"
const LEGACY_ACCOUNT_KEY = "gw.github.account"

const tokenKey = (login: string) => `gw.github.token.${login}`

let storeCache: AccountStore | null = null
const tokenCache: Record<string, string | null> = {}

/* ------------------------------------------------------------ 内部 */

function ensureMigrated(store: AccountStore): AccountStore {
  if (store.accounts.length > 0) return store
  const legacyAccount = Storage.get<Partial<Account>>(LEGACY_ACCOUNT_KEY)
  const legacyToken = Keychain.get(LEGACY_TOKEN_KEY, { synchronizable: true })
  if (!legacyAccount || !legacyAccount.login || !legacyToken) return store
  const account: Account = {
    login: legacyAccount.login,
    name: legacyAccount.name || legacyAccount.login,
    avatarURL: legacyAccount.avatarURL || "",
    htmlURL: legacyAccount.htmlURL || "",
    publicRepos: legacyAccount.publicRepos || 0,
    scope: legacyAccount.scope || "unknown",
    lastVerified: legacyAccount.lastVerified || Date.now(),
    addedAt: legacyAccount.addedAt || Date.now(),
  }
  Keychain.set(tokenKey(account.login), legacyToken, { synchronizable: true })
  Keychain.remove(LEGACY_TOKEN_KEY, { synchronizable: true })
  Storage.set(ACCOUNTS_KEY, { accounts: [account], active: account.login })
  Storage.remove(LEGACY_ACCOUNT_KEY)
  return { accounts: [account], active: account.login }
}

function loadStore(): AccountStore {
  if (!storeCache) {
    const stored = Storage.get<AccountStore>(ACCOUNTS_KEY)
    let next: AccountStore =
      stored && stored.accounts
        ? { accounts: stored.accounts, active: stored.active || null }
        : { accounts: [], active: null }
    next = ensureMigrated(next)
    if (next.accounts.length > 0 && !next.active) next.active = next.accounts[0].login
    storeCache = next
  }
  return storeCache
}

function persistStore(next: AccountStore): void {
  storeCache = next
  Storage.set(ACCOUNTS_KEY, next)
}

/* ------------------------------------------------------------ 账户列表 */

export function listAccounts(): Account[] {
  return loadStore().accounts.slice()
}

export function accountCount(): number {
  return loadStore().accounts.length
}

export function getActiveLogin(): string | null {
  return loadStore().active
}

/** 当前账户（旧调用点仍然可用） */
export function getAccount(): Account | null {
  const store = loadStore()
  if (!store.active) return null
  return store.accounts.find(account => account.login === store.active) || null
}

export function findAccount(login: string): Account | null {
  return loadStore().accounts.find(account => account.login === login) || null
}

export function hasToken(): boolean {
  return loadStore().accounts.length > 0
}

/* ------------------------------------------------------------ 令牌 */

/** 读取令牌；不传 login 表示当前账户 */
export function getToken(login?: string): string | null {
  const target = login || getActiveLogin()
  if (!target) return null
  if (tokenCache[target] === undefined) {
    tokenCache[target] = Keychain.get(tokenKey(target), { synchronizable: true }) || null
  }
  return tokenCache[target]
}

export function requireToken(): string {
  const token = getToken()
  if (!token) {
    throw new Error("尚未配置 GitHub 访问令牌")
  }
  return token
}

/** 只显示头尾，任何 UI 都不展示完整令牌 */
export function maskedToken(login?: string): string {
  const token = getToken(login)
  if (!token) return "未配置"
  if (token.length <= 8) return "••••••••"
  return `${token.slice(0, 4)}••••••••${token.slice(-4)}`
}

/* ------------------------------------------------------------ 增删改 */

/**
 * 添加 / 更新一个账户并设为当前账户。
 * 调用方需要先用 getViewer(token) 验证令牌有效。
 */
export function addAccount(account: Account, token: string): void {
  const store = loadStore()
  const others = store.accounts.filter(item => item.login !== account.login)
  const previous = store.accounts.find(item => item.login === account.login)
  const value = token.trim()
  Keychain.set(tokenKey(account.login), value, { synchronizable: true })
  tokenCache[account.login] = value
  const next: Account = {
    ...account,
    addedAt: previous ? previous.addedAt : account.addedAt || Date.now(),
    lastVerified: Date.now(),
  }
  persistStore({ accounts: [...others, next], active: account.login })
  reclaimLegacyKeys()
}

/** 更新已有账户的资料（不改变当前账户） */
export function updateAccount(account: Account): void {
  const store = loadStore()
  if (!store.accounts.some(item => item.login === account.login)) return
  persistStore({
    accounts: store.accounts.map(item =>
      item.login === account.login ? { ...item, ...account, addedAt: item.addedAt } : item
    ),
    active: store.active,
  })
}

export function switchAccount(login: string): boolean {
  const store = loadStore()
  if (!store.accounts.some(item => item.login === login)) return false
  persistStore({ accounts: store.accounts, active: login })
  return true
}

/** 移除账户（登出）；移除的是当前账户时自动切到剩下的第一个 */
export function removeAccount(login: string): void {
  const store = loadStore()
  const rest = store.accounts.filter(item => item.login !== login)
  Keychain.remove(tokenKey(login), { synchronizable: true })
  delete tokenCache[login]
  persistStore({
    accounts: rest,
    active: store.active === login ? (rest[0] ? rest[0].login : null) : store.active,
  })
}

/** 兼容旧调用：登出当前账户 */
export function clearToken(): void {
  const login = getActiveLogin()
  if (login) removeAccount(login)
}

/** 兼容旧调用：更新当前账户的令牌 */
export function saveToken(token: string): void {
  const login = getActiveLogin()
  if (!login) return
  if (!token.trim()) {
    removeAccount(login)
    return
  }
  Keychain.set(tokenKey(login), token.trim(), { synchronizable: true })
  tokenCache[login] = token.trim()
}

/** 兼容旧调用：更新账户资料 */
export function saveAccount(account: Account): void {
  updateAccount(account)
}

/** 清理旧版本遗留的单账户数据 */
function reclaimLegacyKeys(): void {
  Keychain.remove(LEGACY_TOKEN_KEY, { synchronizable: true })
  Storage.remove(LEGACY_ACCOUNT_KEY)
}
