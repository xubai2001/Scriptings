# Lume RSS

以阅读体验为核心的现代 RSS 客户端（Scripting for iOS 脚本项目）。

> RSS 负责发现内容，Lume 负责把内容变得好读。

## 目录结构

```
index.tsx              入口：加载本地数据 → 呈现根视图 → 关闭时 Script.exit()
script.json            脚本描述
models.ts              Feed / Article / Folder / AIProvider / AISummary / Settings 等数据模型
theme.ts               颜色、排版、圆角与 Shape 帮助函数（clipShape 只接受 Shape 值）

lib/
  markup.ts            容错的 XML/HTML 解析器（无 DOMParser，自研）
  utils.ts             URL / 时间 / HTML 实体 / 文本 / token 估算 / 阅读时长
  media.ts             Media Extractor：media:content → thumbnail → enclosure → Atom → HTML <img> → og:image
  content.ts           Content Extractor：HTML → 结构化正文块（带 noise 标记）+ readability-lite
  feed_parser.ts       RSS 2.0 / RSS 1.0(RDF) / Atom / JSON Feed 解析 + 去重键
  discovery.ts         输入普通网址时自动发现 feed（link rel=alternate / 常见路径）
  opml.ts              OPML 导入与导出
  persist.ts           文件持久化（App Group 下的 lume/），API Key 存 Keychain
  store.ts             模块级单例状态 + 订阅（present 出来的视图拿不到 React Context）
  refresh.ts           拉取 / 解析 / 合并去重 / 写盘；每个 feed 独立刷新，失败不影响其他源
  image_cache.ts       图片缓存（临时 / 文章 / 收藏共用，带容量上限清理）
  ai.ts                Provider 抽象 + Map→Reduce 分段摘要 + 友好错误 + 输出解析

ui/
  root.tsx             4 个 Tab：首页 / 订阅 / 收藏 / 设置
  home.tsx             首页：问候语 + 横向筛选（全部/未读/收藏/图片/AI）+ 文章列表
  article.tsx          文章详情：三种阅读模式、阅读进度、继续阅读、图片查看器、AI 面板
  components.tsx       ArticleRow / 骨架屏 / 空状态 / FeedIcon / 筛选条等
  image_viewer.tsx     图片查看器：捏合缩放 / 拖动 / 双击放大 / 长按保存 / 左右切换
  ai_summary.tsx       AI 摘要面板（阅读工具，不是聊天界面）
  ai_settings.tsx      Provider（DeepSeek / OpenAI / 自定义）、模型、测试连接、生成设置
  subscriptions.tsx    订阅列表（文件夹分组）+ 订阅源详情
  add_feed.tsx         添加订阅 + 发现多个订阅源时的选择界面
  favorites.tsx        收藏 / 稍后阅读（独立快照，保留正文与图片）
  settings.tsx         阅读 / AI / 订阅 / 导入导出 / 缓存 / 外观 / 关于

dev/                   开发自检（不是脚本入口）
  selftest.ts          纯逻辑自检：解析 / 提取 / 去重 / OPML / AI 输出解析（不需要联网）
  preview_article.tsx  构造一篇文章并渲染文章详情页
  preview_root.tsx     塞入示例数据并渲染根视图
  preview_images.tsx   三种典型图片 URL 形态的渲染检查
  imagecheck.ts        少数派图床的 URL 与下载专项检查
  netcheck.ts          真实订阅源 + 真实网页正文提取
```

## 内容解析链路

```
Feed Parser → Article Normalizer → Content Extractor → Media Extractor → Article Renderer
```

正文获取优先级：`RSS 完整正文 → content:encoded → description → 原网页正文解析 → 仅摘要`。
RSS 已提供完整正文时不会再请求网站；只给摘要时，会在**打开文章时**再抓一次原网页（可关闭）。

正文块类型：`paragraph / heading / image / video / quote / code / list / table / divider`，
每块带 `noise` 标记：

- **原文模式** = 全部块
- **阅读模式** = 过滤掉 noise（广告、导航、分享、评论、相关推荐等）

## 数据与隐私

- 所有数据保存在 `App Group/lume/`：`feeds.json`、`folders.json`、`articles/<feedId>.json`、
  `index.json`（列表用的轻量元数据）、`saved.json`（收藏 / 稍后阅读的完整快照）、`images/`。
- 列表只在内存里保留轻量元数据，正文块与原始 HTML 按需从磁盘读取。
- API Key 存在系统 Keychain，不会写入文件、不会上传。
- AI 完全可选；默认「手动」，只在用户点击 AI（或显式开启自动总结）时才会把文章内容发给所配置的服务商。

## 使用

脚本会用**全屏**方式呈现（不是 sheet，否则下拉手势会和「下拉刷新」撞车）：

- 左上角的 **X** 退出（会先把阅读状态落盘再关闭）；
- 下拉就是刷新，不会被误关闭；
- 首页顶部搜索框、右上角 `⋯` 里是刷新 / 全部标为已读 / 添加订阅。

## 图片

**所有远程图片都先用我们自己的网络层下载到本地，再用 `filePath` 渲染**，`imageUrl` 只作兜底。

原因：平台内置的 `<Image imageUrl>` 用的是它自己的加载器，对某些图床的 URL 形态会加载失败——典型例子是少数派的
`https://cdnfile.sspai.com/….jpg?imageView2/2/w/1120/q/90/interlace/1/ignore-error/1`
（查询串里带斜杠、末尾没有扩展名）。同样的 URL 我们自己 `fetch` 能拿到，所以由我们负责下载。

附带好处：图片会进磁盘缓存（默认上限 500 MB，可在设置里改），收藏文章与已打开的正文图片离线可读，
列表滑过的图片也不会重复下载；下载并发上限 4，避免长列表里一次发起太多请求。

## 已知取舍

- 平台没有 `MagnificationGesture` 之外的缩放手势 API，图片查看器用 `MagnifyGesture` + 拖动 + 双击实现。
- 平台 `List` 没有 `onMove`，所以「拖动订阅源改变分类」用订阅源详情里的「分类」选择器完成。
- 不做云同步（第一版），不做常驻后台轮询；前台定时刷新用递归 `setTimeout`（只在 App 运行时生效）。

## 三种阅读模式

| 模式 | 显示什么 |
| --- | --- |
| **阅读模式** | 过滤掉被识别为广告 / 模板文字 / 元信息的块（`ContentBlock.noise === true`），完整正文优先 |
| **原文** | feed / 原网页给的**全部**块，包括上面那些；它们会以 45% 不透明度淡化显示 |
| **原网页** | 用 `WebViewController` 直接加载原站页面，排版由网站决定 |

模式选择器下方会有一行说明告诉你当前差别（例如「阅读模式：已为你去掉 4 处广告 / 模板文字」）。
**如果这篇文章没有可精简的块，两种模式本来就长得一样** —— 这时会明说「没有可精简的内容」，而不是让你以为开关坏了。

噪声识别分两关：

1. DOM 层：`class` / `id` / `role` 提示、标签名（`nav`/`aside`/`footer`…）。
2. 文本层（`tagContentNoise`）：元信息开头（`Article URL:`/`Points:`…）、URL 占比 ≥45% 的链接堆、
   链接文案（查看全文 / Read more…）、社交与版权模板（关注我们 / 转载 / 订阅 / Subscribe…）、
   以及结尾三块里带 emoji / 域名 / 站点名的推广语。规则宁漏不误，且永远不会把「全篇最长的块」和「首块」判为噪声。

两个容易写错、已写进自检的地方：

- **落盘的必须是全部块**（`extracted.blocks`），不是 `readerBlocks()` 的结果。只存过滤后的块会让「原文模式」永远空无一物。
- 改完提取 / 噪声规则要 **bump `content.ts` 的 `PIPELINE_VERSION`**。文章只存一份解析结果，不 bump 的话已经缓存过的旧文章永远带着旧规则的结果。`store.fullArticle()` 发现版本落后时，会用本地已存的 HTML 重解析一次（不联网）。

## 字体

正文与标题的字体可以分别设置（设置 → 字体）：

| 方式 | 实现 | 要不要准确填写名字 |
| --- | --- | --- |
| 系统内置变体 | `<Text fontDesign="serif" / "rounded" / "monospaced" / "default">` | 不用，一定生效 |
| 自定义字体族 | `<Text font={{ name, size }}>` | 要，填系统字体名（PostScript / family，如 `PingFangSC-Regular`、`Songti SC`） |
| 只改字号 | `<Text font={17}>` | — |

- 统一入口：`lib/typography.ts` 的 `fontProps(setting, size)` 返回可直接展开到 `<Text>` 上的属性：`<Text {...fontProps(settings.bodyFont, 17)}>正文</Text>`。
- 应用范围：文章标题、正文段落 / 引用 / 列表 / 表格、正文里的小标题、列表行标题、订阅详情的「最近文章」。代码块始终等宽，作者 / 时间 / 阅读时长等元信息始终系统字体。
- 字体名写错或设备上没有该字体时，SwiftUI 会**静默回退**到系统字体。平台没有枚举系统字体族的 API，代码层面无法校验，所以设置页里预置了几个常见字体名并允许手填，同时保留了四个系统内置变体作为「一定会生效」的选项。

## 开发自检

```sh
scripting-ts run "<项目>/dev/selftest.ts"
scripting-ts run "<项目>/dev/storecheck.ts"
scripting-ts preview_ui "<项目>/dev/preview_article.tsx"
scripting-ts preview_ui "<项目>/dev/preview_settings.tsx"   # 字体设置面板
scripting-ts preview_ui "<项目>/dev/preview_root.tsx"
```

预览脚本里要注意：示例数据（阅读模式、字体…）必须在**模块顶层**就设好，写在 `useEffect` 里不会影响已完成的首次渲染。

⚠️ **dev/ 下的脚本必须第一行 `import "./isolate"`**：它把数据目录隔离到 `lume-dev/` 并禁用写入。
早期预览脚本没有隔离，结果把示例订阅和示例文章写进了用户的真实数据（平白多出一个 The Verge 订阅）。

`dev/cleanup.ts` 是一次性的数据清理脚本（不 import isolate），用于删掉那些误写入的示例数据。
