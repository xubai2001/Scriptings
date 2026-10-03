/**
 * 离线自检：不联网，纯逻辑验证解析 / 提取 / 去重 / OPML。
 * 运行：scripting-ts run "<项目>/dev/selftest.ts"
 */

import { Script } from "scripting"
import { parseFeed, dedupeKeyOf } from "../lib/feed_parser"
import { extractBlocks, extractWebArticle, readerBlocks, blocksToPlainText } from "../lib/content"
import { heroImage, dedupeMedia } from "../lib/media"
import { buildOPML, parseOPML } from "../lib/opml"
import { canonicalURL, estimateTokens, htmlToText, relativeTime, estimateReadingMinutes, initialsOf } from "../lib/utils"
import { parseSummaryOutput } from "../lib/ai"
import { fontPresetID, fontProps, normalizeFontSetting, settingFromPreset } from "../lib/typography"

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>The Verge</title>
    <link>https://www.theverge.com</link>
    <description>Tech news</description>
    <image><url>https://cdn.example.com/logo.png</url></image>
    <item>
      <title>Apple announces a completely new approach</title>
      <link>https://www.theverge.com/2026/9/20/apple?utm_source=rss&amp;utm_medium=feed</link>
      <guid isPermaLink="false">verge-12345</guid>
      <pubDate>Sat, 20 Sep 2026 10:00:00 GMT</pubDate>
      <dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/"><![CDATA[Jane Doe]]></dc:creator>
      <category>Apple</category>
      <media:content url="https://cdn.example.com/hero.jpg" type="image/jpeg" width="1200" height="800" />
      <media:thumbnail url="https://cdn.example.com/thumb.jpg" />
      <description><![CDATA[<p>Apple has announced a new approach.</p><img src="/inline.png" alt="Inline" />]]></description>
      <content:encoded><![CDATA[
        <div class="article-body">
          <h1>Apple announces a completely new approach</h1>
          <p>The company said the change affects <strong>every</strong> device &amp; service.</p>
          <figure><img src="https://cdn.example.com/figure.jpg" srcset="https://cdn.example.com/figure-2x.jpg 2x" /><figcaption>An Apple device</figcaption></figure>
          <h2>What changes</h2>
          <ul><li>Faster chips</li><li>Lower prices</li></ul>
          <blockquote>“This is a big deal.”<cite>Tim</cite></blockquote>
          <pre><code class="language-swift">let x = 1</code></pre>
          <p>Read more</p>
          <div class="sharedaddy share-buttons"><p>Share on Twitter</p></div>
        </div>
      ]]></content:encoded>
    </item>
  </channel>
</rss>`

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>GitHub Blog</title>
  <subtitle>Updates</subtitle>
  <link rel="alternate" href="https://github.blog" />
  <icon>https://github.blog/icon.png</icon>
  <entry>
    <title>Copilot update</title>
    <link rel="alternate" href="https://github.blog/2026/09/19/copilot/" />
    <id>tag:github.blog,2026:copilot</id>
    <published>2026-09-19T08:30:00Z</published>
    <author><name>GitHub</name></author>
    <content type="html">&lt;p&gt;New features shipped.&lt;/p&gt;&lt;img src="https://github.blog/x.png"&gt;</content>
  </entry>
</feed>`

const JSON_FEED = JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  title: "Daring Fireball",
  home_page_url: "https://daringfireball.net",
  icon: "https://daringfireball.net/icon.png",
  items: [
    {
      id: "1",
      url: "https://daringfireball.net/2026/09/post",
      title: "On RSS",
      content_html: "<p>RSS is still great.</p><img src=\"https://daringfireball.net/img.png\">",
      date_published: "2026-09-18T12:00:00Z",
      author: { name: "John" },
      tags: ["rss", "web"],
    },
  ],
})

function line(label: string, value: unknown) {
  console.log(`${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
}

function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`)
}

// ── RSS ─────────────────────────────────────────────────────
const rss = parseFeed(RSS, "https://www.theverge.com/rss")
check("RSS meta.title", rss.meta.title === "The Verge", rss.meta.title)
check("RSS meta.icon", rss.meta.iconURL === "https://cdn.example.com/logo.png", rss.meta.iconURL)
check("RSS items", rss.items.length === 1)
const item = rss.items[0]
check("item.title", item.title === "Apple announces a completely new approach", item.title)
check("item.url 已解析实体", item.url.startsWith("https://www.theverge.com/2026/9/20/apple?"), item.url)
check("item.author", item.author === "Jane Doe", item.author)
check("item.publishedAt > 0", item.publishedAt > 0, new Date(item.publishedAt).toISOString())
check("item.categories", item.categories[0] === "Apple", item.categories)
line("item 媒体数量", item.images.length)
check("media:content 在第一位", item.images[0]?.source === "media:content", item.images[0]?.url)
check("hero 图存在", !!heroImage(item.images), heroImage(item.images)?.url)

const extracted = extractBlocks(item.htmlContent, { baseURL: item.url, title: item.title })
line("正文块", extracted.blocks.map((b) => `${b.kind}${b.noise ? "(noise)" : ""}`))
line("正文图片", extracted.images.map((m) => m.url))
check("段落被提取", extracted.blocks.filter((b) => b.kind === "paragraph").length >= 2)
check("figcaption 变成 caption", extracted.blocks.some((b) => b.kind === "image" && b.media.caption === "An Apple device"))
check("列表被提取", extracted.blocks.some((b) => b.kind === "list"))
check("引用被提取", extracted.blocks.some((b) => b.kind === "quote"))
check("代码块被提取", extracted.blocks.some((b) => b.kind === "code"))
check("分享按钮被标为 noise", extracted.blocks.some((b) => b.noise))
const reader = readerBlocks(extracted.blocks)
check("阅读模式过滤掉 noise", reader.every((b) => !b.noise))
check("阅读模式保留图片", reader.some((b) => b.kind === "image"))
line("正文纯文本长度", blocksToPlainText(reader).length)
line("阅读时长(分钟)", estimateReadingMinutes(blocksToPlainText(reader)))

// ── Atom ────────────────────────────────────────────────────
const atom = parseFeed(ATOM, "https://github.blog/feed")
check("Atom meta.title", atom.meta.title === "GitHub Blog", atom.meta.title)
check("Atom entry 链接", atom.items[0]?.url === "https://github.blog/2026/09/19/copilot/", atom.items[0]?.url)
check("Atom 作者", atom.items[0]?.author === "GitHub", atom.items[0]?.author)
check("Atom 内容里的图片", (atom.items[0]?.images.length ?? 0) > 0, atom.items[0]?.images)

// ── JSON Feed ───────────────────────────────────────────────
const json = parseFeed(JSON_FEED, "https://daringfireball.net/feed.json")
check("JSON feed meta", json.meta.feedType === "json" && json.meta.title === "Daring Fireball", json.meta)
check("JSON item", json.items[0]?.title === "On RSS", json.items[0]?.title)
check("JSON item 图片", (json.items[0]?.images.length ?? 0) > 0)

// ── 原网页正文解析 ──────────────────────────────────────────
const PAGE = `<html><head>
  <meta property="og:image" content="https://example.com/og.jpg" />
  <meta property="og:description" content="A description" />
  <title>Example</title>
  <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
  </head><body>
  <header><nav><a href="/">Home</a></nav></header>
  <div class="sidebar"><p>Related links</p></div>
  <article class="post-content">
    <h1>Example</h1>
    <p>This is the first paragraph of the story, and it is long enough to be considered real content for scoring purposes. It keeps going for a while.</p>
    <p>Second paragraph continues the article with enough words to make the extractor confident about this container being the main body.</p>
    <img src="https://example.com/photo.jpg" />
  </article>
  <footer><p>© 2026</p></footer>
  </body></html>`
const web = extractWebArticle(PAGE, "https://example.com/post")
check("原网页 OG 图", web.imageURL === "https://example.com/og.jpg", web.imageURL)
check("原网页正文块", web.blocks.length >= 2, web.blocks.length)
check("原网页不去选 sidebar", !web.blocks.some((b) => b.kind === "paragraph" && b.text.includes("Related links")))
check("原网页图片", web.images.some((m) => m.url === "https://example.com/photo.jpg"), web.images.map((m) => m.url))

// ── OPML ────────────────────────────────────────────────────
const opmlText = buildOPML(
  [
    { id: "1", title: "The Verge", url: "https://theverge.com/rss", siteURL: "https://theverge.com", description: "", unreadCount: 0, isMuted: false, sortOrder: 0, folderID: "f1" },
    { id: "2", title: "HN", url: "https://hnrss.org/frontpage", siteURL: "", description: "", unreadCount: 0, isMuted: false, sortOrder: 1 },
  ],
  [{ id: "f1", name: "科技", sortOrder: 0 }]
)
const outlines = parseOPML(opmlText)
check("OPML 往返", outlines.length === 2, outlines)
check("OPML 文件夹", outlines.find((o) => o.url.includes("theverge"))?.folder === "科技", outlines)

// ── 工具函数 ────────────────────────────────────────────────
check("canonical 去掉 utm", canonicalURL("https://a.com/x?utm_source=1&id=2#frag") === "https://a.com/x?id=2", canonicalURL("https://a.com/x?utm_source=1&id=2#frag"))
check("去重键稳定", dedupeKeyOf({ guid: "abc", url: "https://a.com/1", title: "t", publishedAt: 1 }) === dedupeKeyOf({ guid: "abc", url: "https://a.com/2", title: "t", publishedAt: 2 }))
check("HTML 转文本", htmlToText("<p>Hello&nbsp;<b>world</b></p>") === "Hello world", htmlToText("<p>Hello&nbsp;<b>world</b></p>"))
line("token 估算(1000 汉字)", estimateTokens("中".repeat(1000)))
line("相对时间", relativeTime(Date.now() - 2 * 3600 * 1000))
check("首字母头像", initialsOf("The Verge") === "TV", initialsOf("The Verge"))
check("中文首字母头像", initialsOf("少数派") === "少", initialsOf("少数派"))

// ── AI 输出解析 ─────────────────────────────────────────────
const parsed = parseSummaryOutput('```json\n{"oneLine":"一句话","points":["a","b"],"data":["A17 Pro","3nm"],"conclusion":"结论"}\n```')
check("AI JSON 解析", parsed.oneLine === "一句话" && parsed.points.length === 2 && parsed.data.length === 2, parsed)
const fallback = parseSummaryOutput("这是一句话总结\n• 要点一\n• 要点二")
check("AI 纯文本回退", fallback.oneLine === "这是一句话总结" && fallback.points.length === 2, fallback)

// ── 阅读模式 vs 原文模式：噪声识别 ──────────────────────
const MODE_HTML = `<html><body><article>
  <p>这是一段真正的正文段落，描述了某个产品在实际使用中的体验，内容足够长，应该被认为是正文。这是一段真正的正文段落，描述了某个产品在实际使用中的体验。这是一段真正的正文段落。</p>
  <p>第二段正文继续展开论述，长度同样足够，不应该被当成模板文字或推广内容删除。第二段正文继续展开论述，长度同样足够。不应该被当成模板文字。</p>
  <h2>小标题</h2>
  <p>结尾这一句很短，但是正文。</p>
  <p>本文由 XX 授权转载，未经许可不得转载</p>
  <p>关注我们</p>
  <p>阅读全文</p>
  <p>The post 标题 appeared first on Example</p>
  <p>Article URL: https://example.com/a Comments URL: https://news.ycombinator.com/item?id=1 Points: 67 # Comments: 16</p>
  <p>简单、好用、，少数派为你呈现 🚀专注的写作软件</p>
  <p>特惠、好用的硬件产品，尽在 🛒少数派 sspai 官方店铺</p>
  <p>6位派友已充电</p>
</article></body></html>`

const modeExtract = extractBlocks(MODE_HTML, { baseURL: "https://sspai.com/post/1", title: "测试文章" })
const modeReader = readerBlocks(modeExtract.blocks)
for (const block of modeExtract.blocks) {
  const text = (block as { text?: string }).text ?? ""
  console.log(`   [${block.noise ? "原文专属" : "正文"}] ${block.kind === "heading" ? "小标题" : text.slice(0, 34)}`)
}
const noiseTexts = modeExtract.blocks.filter((b) => b.noise).map((b) => ((b as { text?: string }).text ?? "").slice(0, 40))
check("授权转载被识别为噪声", noiseTexts.some((t) => t.includes("授权转载")), noiseTexts)
check("关注我们 / 阅读全文被识别", noiseTexts.some((t) => t.includes("阅读全文")))
check("appeared first on 被识别", noiseTexts.some((t) => t.includes("appeared first on")) || !modeExtract.blocks.some((b) => ((b as { text?: string }).text ?? "").includes("appeared first on")))
check("feed 元信息块被识别", noiseTexts.some((t) => t.startsWith("Article URL")), noiseTexts)
check("结尾 emoji 推广被识别", noiseTexts.some((t) => t.includes("少数派为你呈现")) && noiseTexts.some((t) => t.includes("官方店铺")))
check("充电计数被识别", noiseTexts.some((t) => t.includes("已充电")))
check("正文章节未被误伤", modeReader.length === 4, modeReader.map((b) => ((b as { text?: string }).text ?? "").slice(0, 12)))
check("阅读模式确实比原文短", modeReader.length < modeExtract.blocks.length, [modeReader.length, modeExtract.blocks.length])

// ── 字体设置 ────────────────────────────────────────────────
const serifBody = normalizeFontSetting({ design: "serif" })
check("字体设置兼容脏数据", normalizeFontSetting(undefined).design === "default" && normalizeFontSetting("x").family === "", [normalizeFontSetting(null), normalizeFontSetting({ design: "weird", family: 3 })])
check("fontProps 只给字号", JSON.stringify(fontProps({ design: "default", family: "" }, 17)) === '{"font":17}', fontProps({ design: "default", family: "" }, 17))
check("fontProps 用系统变体", JSON.stringify(fontProps(serifBody, 17)) === '{"font":17,"fontDesign":"serif"}', fontProps(serifBody, 17))
check(
  "fontProps 用自定义字体族",
  JSON.stringify(fontProps({ design: "default", family: " Songti SC " }, 17)) === '{"font":{"name":"Songti SC","size":17}}',
  fontProps({ design: "default", family: " Songti SC " }, 17)
)
check("预设回显正确", fontPresetID({ design: "default", family: "Songti SC" }) === "songti" && fontPresetID(serifBody) === "serif")
check("选预设写回 family/design", settingFromPreset("kaiti", serifBody).family === "Kaiti SC" && settingFromPreset("rounded", serifBody).design === "rounded")
check("选「自定义」给个可编辑的示例名", settingFromPreset("custom", serifBody).family.length > 0, settingFromPreset("custom", serifBody))
check("手填字体名回显为自定义", fontPresetID({ design: "default", family: "MyFont-Bold" }) === "custom")

// ── 媒体去重 / 过滤 ─────────────────────────────────────────
const deduped = dedupeMedia([
  { id: "1", type: "image", url: "https://a.com/x.jpg?v=1", source: "content" },
  { id: "2", type: "image", url: "https://a.com/x.jpg?v=2", source: "content" },
  { id: "3", type: "image", url: "https://a.com/pixel.gif", source: "content", width: 1, height: 1 },
])
check("媒体去重 + 过滤追踪像素", deduped.length === 1, deduped.map((m) => m.url))

console.log("=== probe done ===")
Script.exit("probe finished")
