/** Tab 3：活动（§28） —— 最近执行过的 Git / Gist 操作 */

import {
  Button,
  HStack,
  Image,
  List,
  Menu,
  NavigationLink,
  NavigationStack,
  Section,
  Spacer,
  Text,
  VStack,
} from "scripting"
import { ActivityItem } from "../types"
import { accountCount } from "../api/auth"
import { activityIcon, activityKindLabel, clearActivity, listActivity } from "../services/activity"
import { emitters } from "../utils/emitter"
import { useWatch } from "../utils/hooks"
import { dateTime, dayGroup, relativeTime, timeOnly } from "../utils/format"
import { EmptyState, ExitAppButton, Hint } from "./components"

export function ActivityTab() {
  useWatch(emitters.activity)
  const items = listActivity()
  const multiAccount = accountCount() > 1

  const groups: { day: string; items: ActivityItem[] }[] = []
  items.forEach(item => {
    const day = dayGroup(item.ts)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push(item)
    else groups.push({ day, items: [item] })
  })

  return (
    <NavigationStack>
      <List
        navigationTitle="活动"
        toolbar={{
          topBarLeading: <ExitAppButton />,
          topBarTrailing: (
            <Menu title="更多" systemImage="ellipsis.circle">
              <Button title="清空活动" systemImage="trash" role="destructive" action={async () => {
                const ok = await Dialog.confirm({
                  title: "清空活动记录？",
                  message: "只会删除本地记录，不影响 GitHub 上的内容。",
                  confirmLabel: "清空",
                })
                if (ok) clearActivity()
              }} />
            </Menu>
          ),
        }}
      >
        {items.length === 0 ? (
          <Section>
            <EmptyState
              icon="clock.arrow.circlepath"
              title="还没有活动"
              message="同步 Gist、提交文件、创建分支之后，这里会留下记录。"
            />
          </Section>
        ) : (
          groups.map(group => (
            <Section
              key={group.day}
              header={<Text font="footnote" foregroundStyle="secondaryLabel">{group.day}</Text>}
            >
              {group.items.map(item => (
                <NavigationLink key={item.id} destination={<ActivityDetailView id={item.id} />}>
                  <HStack spacing={10} padding={{ vertical: 3 }}>
                    <Image
                      systemName={activityIcon(item)}
                      foregroundStyle={item.ok ? "systemGreen" : "systemRed"}
                    />
                    <VStack alignment="leading" spacing={2}>
                      <Text lineLimit={1}>{item.title}</Text>
                      <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
                        {multiAccount && item.account
                          ? `@${item.account} · ${item.subtitle || activityKindLabel(item.kind)}`
                          : item.subtitle || activityKindLabel(item.kind)}
                      </Text>
                    </VStack>
                    <Spacer />
                    <Text font="caption" foregroundStyle="tertiaryLabel">
                      {timeOnly(item.ts)}
                    </Text>
                  </HStack>
                </NavigationLink>
              ))}
            </Section>
          ))
        )}

        {items.length > 0 ? (
          <Section footer={<Hint text="最多保留最近 300 条记录。" />}>
            <Text font="footnote" foregroundStyle="secondaryLabel">
              {`共 ${items.length} 条记录`}
            </Text>
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  )
}

export function ActivityDetailView({ id }: { id: string }) {
  useWatch(emitters.activity)
  const item = listActivity().find(entry => entry.id === id)

  if (!item) {
    return (
      <List navigationTitle="活动详情" navigationBarTitleDisplayMode="inline">
        <Section>
          <EmptyState icon="questionmark" title="记录已被清除" />
        </Section>
      </List>
    )
  }

  return (
    <List navigationTitle={item.title} navigationBarTitleDisplayMode="inline">
      <Section
        header={
          <VStack alignment="leading" spacing={3}>
            <HStack spacing={8}>
              <Image
                systemName={activityIcon(item)}
                foregroundStyle={item.ok ? "systemGreen" : "systemRed"}
              />
              <Text font="headline">{item.title}</Text>
            </HStack>
            <Text font="footnote" foregroundStyle="secondaryLabel">
              {item.subtitle}
            </Text>
          </VStack>
        }
      >
        <HStack>
          <Text foregroundStyle="secondaryLabel">结果</Text>
          <Spacer />
          <Text foregroundStyle={item.ok ? "systemGreen" : "systemRed"}>
            {item.ok ? "成功" : "失败"}
          </Text>
        </HStack>
        <HStack>
          <Text foregroundStyle="secondaryLabel">类型</Text>
          <Spacer />
          <Text>{activityKindLabel(item.kind)}</Text>
        </HStack>
        <HStack>
          <Text foregroundStyle="secondaryLabel">操作时间</Text>
          <Spacer />
          <Text>{`${dateTime(item.ts)}（${relativeTime(item.ts)}）`}</Text>
        </HStack>
        {item.repo ? (
          <HStack>
            <Text foregroundStyle="secondaryLabel">仓库</Text>
            <Spacer />
            <Text>{item.repo}</Text>
          </HStack>
        ) : null}
        {item.branch ? (
          <HStack>
            <Text foregroundStyle="secondaryLabel">Branch</Text>
            <Spacer />
            <Text>{item.branch}</Text>
          </HStack>
        ) : null}
        {item.account ? (
          <HStack>
            <Text foregroundStyle="secondaryLabel">账户</Text>
            <Spacer />
            <Text>{`@${item.account}`}</Text>
          </HStack>
        ) : null}
        {item.httpStatus ? (
          <HStack>
            <Text foregroundStyle="secondaryLabel">HTTP 状态</Text>
            <Spacer />
            <Text>{String(item.httpStatus)}</Text>
          </HStack>
        ) : null}
      </Section>

      {item.files.length > 0 ? (
        <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">涉及文件</Text>}>
          {item.files.map(file => (
            <Text key={file} font="footnote" lineLimit={2}>
              {file}
            </Text>
          ))}
        </Section>
      ) : null}

      {item.detail ? (
        <Section header={<Text font="footnote" foregroundStyle="secondaryLabel">详情</Text>}>
          <Text font="footnote" foregroundStyle="secondaryLabel">
            {item.detail}
          </Text>
        </Section>
      ) : null}

      {item.error ? (
        <Section
          header={<Text font="footnote" foregroundStyle="secondaryLabel">错误信息</Text>}
          footer={<Hint text="这类信息用于排查问题，可以复制给开发者。" />}
        >
          <Text font="footnote" foregroundStyle="systemRed">
            {item.error}
          </Text>
          <Button
            title="复制错误信息"
            systemImage="doc.on.doc"
            action={async () => {
              await Pasteboard.setString(item.error)
            }}
          />
        </Section>
      ) : null}
    </List>
  )
}
