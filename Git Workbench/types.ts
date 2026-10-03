/**
 * Git Workbench — 统一数据模型
 *
 * 所有网络层返回的原始 GitHub JSON 都会被转换成这里的结构，
 * UI 只依赖这些类型，不直接消费 GitHub 的字段名。
 */

/** 目录项类型 */
export type EntryType = "file" | "dir" | "symlink" | "submodule"

/** 仓库摘要（列表用） */
export type Repository = {
  id: number
  name: string
  fullName: string
  owner: string
  description: string
  defaultBranch: string
  updatedAt: string
  pushedAt: string
  htmlURL: string
  stars: number
  forks: number
  language: string | null
  isPrivate: boolean
  isFork: boolean
  isArchived: boolean
  createdAt: string
  sizeKB: number
}

/** 仓库详情（详情页用） */
export type RepositoryDetail = Repository & {
  branches: string[]
  openIssues: number
  ownerAvatar: string
  cloneURL: string
}

/** 目录 / 文件条目 */
export type FileEntry = {
  name: string
  path: string
  type: EntryType
  size: number
  sha: string
  downloadURL: string
  htmlURL: string
}

/** 文件内容（已解码为文本） */
export type FileContent = {
  path: string
  name: string
  size: number
  sha: string
  text: string
  downloadURL: string
  htmlURL: string
  /** 超过平台预览阈值时为 true，text 可能为空 */
  oversized: boolean
}

/** 提交记录 */
export type Commit = {
  sha: string
  shortSha: string
  message: string
  authorName: string
  authorLogin: string
  authorAvatar: string
  date: string
  htmlURL: string
  parentSha: string
}

/** 提交中的单个文件变更 */
export type CommitFile = {
  filename: string
  status: string
  additions: number
  deletions: number
  patch: string
  previousFilename: string
}

export type CommitDetail = Commit & {
  files: CommitFile[]
}

/** 分支 */
export type Branch = {
  name: string
  sha: string
  isProtected: boolean
  isDefault: boolean
}

/** Tag / Release */
export type RepoTag = {
  name: string
  sha: string
}

export type Release = {
  id: number
  name: string
  tagName: string
  prerelease: boolean
  draft: boolean
  publishedAt: string
  htmlURL: string
  body: string
}

/** Gist 文件元信息 */
export type GistFile = {
  filename: string
  language: string
  size: number
  rawURL: string
  truncated: boolean
  content: string
}

/** Gist 摘要（列表用，content 可能为空） */
export type Gist = {
  id: string
  description: string
  isPublic: boolean
  ownerLogin: string
  ownerAvatar: string
  files: GistFile[]
  createdAt: string
  updatedAt: string
  htmlURL: string
  comments: number
}

/** 草稿同步状态 */
export type SyncState = "synced" | "local" | "syncing" | "failed" | "conflict"

/** 本地草稿 —— 编辑内容的第一落点，网络失败也不能丢 */
export type Draft = {
  /** `gist:<id>` 或 `repo:<owner>/<name>@<ref>:<path>` */
  targetID: string
  filename: string
  /** 编辑开始时的远程版本标识（Gist 用 updatedAt，仓库文件用 blob sha） */
  baseVersion: string
  /** 最近一次已知的远程原始内容，用于差异对比 */
  baseContent: string
  content: string
  updatedAt: number
  state: SyncState
  error: string
}

/** 活动类型 */
export type ActivityKind =
  | "gist_sync"
  | "gist_create"
  | "gist_delete"
  | "gist_file_add"
  | "gist_file_delete"
  | "repo_commit"
  | "repo_branch_create"
  | "repo_branch_delete"
  | "repo_refresh"
  | "auth"

/** 活动记录 */
export type ActivityItem = {
  id: string
  ts: number
  kind: ActivityKind
  title: string
  subtitle: string
  ok: boolean
  detail: string
  error: string
  httpStatus: number
  repo: string
  branch: string
  /** 执行时使用的账户（多账户下用于区分） */
  account: string
  files: string[]
}

/** 最近访问 */
export type RecentItem = {
  /** 唯一键，用于去重 */
  key: string
  kind: "repo_file" | "gist_file"
  title: string
  subtitle: string
  /** gist id 或 owner/repo */
  targetID: string
  filename: string
  ref: string
  ts: number
}

/** 收藏 */
export type Favorites = {
  repos: string[]
  gists: string[]
}

/** 编辑器文字大小（映射到系统 Dynamic Type，原生编辑器会跟着缩放） */
export type EditorTextSize = "small" | "medium" | "large" | "xLarge" | "xxLarge"

/* ------------------------------------------------------- 列表筛选与排序 */

/** 仓库排序方式 */
export type RepoSort = "updated" | "pushed" | "name" | "stars" | "created"

/** 可见性筛选 */
export type VisibilityFilter = "all" | "public" | "private"

/** 仓库类型筛选 */
export type RepoKindFilter = "all" | "source" | "fork" | "archived"

export type RepoFilter = {
  visibility: VisibilityFilter
  kind: RepoKindFilter
  /** 语言筛选，null 表示全部 */
  language: string | null
  favoritesOnly: boolean
}

/** Gist 排序方式 */
export type GistSort = "updated" | "created" | "name" | "files"

export type GistFilter = {
  visibility: VisibilityFilter
  favoritesOnly: boolean
  /** 只看有未同步本地修改的 */
  draftsOnly: boolean
}

/** 设置 */
export type Settings = {
  /** 编辑器 / 代码视图文字大小 */
  editorTextSize: EditorTextSize
  /** Tab 键插入的空格数 */
  tabWidth: number
  /** 工具栏「↩」是否自动补缩进 */
  autoIndent: boolean
  /** 是否自动保存本地草稿 */
  autoSaveDraft: boolean
  appearance: "system" | "light" | "dark"
  /** 请求超时（秒） */
  requestTimeout: number
  /** 缓存有效期（分钟）：超过后打开页面会自动重新请求；0 = 永不自动刷新 */
  cacheTTLMinutes: number
  /** 提交身份 */
  committerName: string
  committerEmail: string
  /** 超过这个大小提示「文件较大」（字节） */
  largeFileThreshold: number
  /** 超过这个大小不再自动加载编辑器（字节） */
  maxPreviewBytes: number
  /** 仓库列表：排序 */
  repoSort: RepoSort
  /** 仓库列表：筛选 */
  repoFilter: RepoFilter
  /** Gist 列表：排序 */
  gistSort: GistSort
  /** Gist 列表：筛选 */
  gistFilter: GistFilter
  /** 仓库页是否显示「最近访问」快捷区（浏览记录仍然保留） */
  showRecentRepositories: boolean
}

/** 当前登录账户快照 */
export type Account = {
  login: string
  name: string
  avatarURL: string
  htmlURL: string
  publicRepos: number
  /** token 状态：ok / 无权限 / 已过期 */
  scope: "unknown" | "repo" | "public"
  lastVerified: number
  addedAt: number
}

/** 多账户库 */
export type AccountStore = {
  accounts: Account[]
  /** 当前使用的账户 login */
  active: string | null
}

/** 目录浏览缓存条目 */
export type CacheEntry<T> = {
  value: T
  ts: number
}
