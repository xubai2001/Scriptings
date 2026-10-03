/**
 * 列表的「排序与筛选」弹层（仓库 / Gist 共用）
 *
 * 修改立即写回设置，所以列表在弹层下面会实时变化；
 * 筛选只作用于「我的仓库 / Starred / 我的 Gist」这些列表。
 */

import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  Picker,
  Section,
  Text,
  Toggle,
  VStack,
} from "scripting"
import {
  GIST_SORT_OPTIONS,
  REPO_KIND_OPTIONS,
  REPO_SORT_OPTIONS,
  VISIBILITY_OPTIONS,
  isGistFilterActive,
  isRepoFilterActive,
} from "../utils/listQuery"
import { GistSort, RepoSort } from "../types"
import { getSettings, updateSettings } from "../services/store"
import { emitters } from "../utils/emitter"
import { useWatch } from "../utils/hooks"
import { Hint } from "./components"

export function ListOptionsSheet({
  kind,
  languages,
}: {
  kind: "repo" | "gist"
  /** 已加载到的仓库语言，用于语言筛选 */
  languages?: string[]
}) {
  const dismiss = Navigation.useDismiss()
  useWatch(emitters.settings)
  const settings = getSettings()

  function resetAll() {
    if (kind === "repo") {
      updateSettings({
        repoSort: "updated",
        repoFilter: { visibility: "all", kind: "all", language: null, favoritesOnly: false },
      })
    } else {
      updateSettings({
        gistSort: "updated",
        gistFilter: { visibility: "all", favoritesOnly: false, draftsOnly: false },
      })
    }
  }

  if (kind === "repo") {
    const filter = settings.repoFilter
    return (
      <NavigationStack>
        <List
          navigationTitle="排序与筛选"
          navigationBarTitleDisplayMode="inline"
          toolbar={{
            cancellationAction: <Button title="完成" action={() => dismiss(true)} />,
            topBarTrailing: isRepoFilterActive(filter) || settings.repoSort !== "updated" ? (
              <Button title="重置" role="destructive" action={resetAll} />
            ) : undefined,
          }}
        >
          <Section
            header={<Text font="footnote" foregroundStyle="secondaryLabel">排序</Text>}
            footer={<Hint text="收藏与最近访问保持自己的顺序，不受这里影响。" />}
          >
            <Picker
              title="排序方式"
              value={settings.repoSort}
              onChanged={(value: string) =>
                updateSettings({ repoSort: value as RepoSort })
              }
              pickerStyle="inline"
            >
              {REPO_SORT_OPTIONS.map(option => (
                <Text key={option.value} tag={option.value}>
                  {`${option.label}（${option.detail}）`}
                </Text>
              ))}
            </Picker>
          </Section>

          <Section
            header={<Text font="footnote" foregroundStyle="secondaryLabel">筛选</Text>}
            footer={<Hint text="筛选同时作用于「我的仓库」与「Starred」。关闭筛选后显示全部。" />}
          >
            <Picker
              title="可见性"
              value={filter.visibility}
              onChanged={(value: string) =>
                updateSettings({ repoFilter: { ...filter, visibility: value as any } })
              }
              pickerStyle="inline"
            >
              {VISIBILITY_OPTIONS.map(option => (
                <Text key={option.value} tag={option.value}>
                  {option.label}
                </Text>
              ))}
            </Picker>
            <Picker
              title="类型"
              value={filter.kind}
              onChanged={(value: string) =>
                updateSettings({ repoFilter: { ...filter, kind: value as any } })
              }
              pickerStyle="inline"
            >
              {REPO_KIND_OPTIONS.map(option => (
                <Text key={option.value} tag={option.value}>
                  {option.label}
                </Text>
              ))}
            </Picker>
            <Picker
              title="语言"
              value={filter.language || "__all__"}
              onChanged={(value: string) =>
                updateSettings({
                  repoFilter: { ...filter, language: value === "__all__" ? null : value },
                })
              }
              pickerStyle="inline"
            >
              <Text tag="__all__">全部语言</Text>
              {(languages || []).map(language => (
                <Text key={language} tag={language}>
                  {language}
                </Text>
              ))}
            </Picker>
            <Toggle
              title="只看收藏"
              value={filter.favoritesOnly}
              onChanged={value =>
                updateSettings({ repoFilter: { ...filter, favoritesOnly: value } })
              }
            />
          </Section>

          <Section footer={<Hint text="提示：列表顶部的摘要条会显示当前生效的条件。" />}>
            <HStack spacing={8}>
              <Image systemName="line.3.horizontal.decrease.circle" foregroundStyle="systemBlue" />
              <Text font="footnote" foregroundStyle="secondaryLabel">
                修改会立即生效，点「完成」关闭。
              </Text>
            </HStack>
          </Section>
        </List>
      </NavigationStack>
    )
  }

  const filter = settings.gistFilter
  return (
    <NavigationStack>
      <List
        navigationTitle="排序与筛选"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="完成" action={() => dismiss(true)} />,
          topBarTrailing:
            isGistFilterActive(filter) || settings.gistSort !== "updated" ? (
              <Button title="重置" role="destructive" action={resetAll} />
            ) : undefined,
        }}
      >
        <Section
          header={<Text font="footnote" foregroundStyle="secondaryLabel">排序</Text>}
          footer={<Hint text="「有未同步的修改」与「收藏」分组保持自己的顺序。" />}
        >
          <Picker
            title="排序方式"
            value={settings.gistSort}
            onChanged={(value: string) => updateSettings({ gistSort: value as GistSort })}
            pickerStyle="inline"
          >
            {GIST_SORT_OPTIONS.map(option => (
              <Text key={option.value} tag={option.value}>
                {`${option.label}（${option.detail}）`}
              </Text>
            ))}
          </Picker>
        </Section>

        <Section
          header={<Text font="footnote" foregroundStyle="secondaryLabel">筛选</Text>}
          footer={<Hint text="筛选作用于「我的 Gist」列表，不影响未同步修改的入口。" />}
        >
          <Picker
            title="可见性"
            value={filter.visibility}
            onChanged={(value: string) =>
              updateSettings({ gistFilter: { ...filter, visibility: value as any } })
            }
            pickerStyle="inline"
          >
            <Text tag="all">全部</Text>
            <Text tag="public">Public</Text>
            <Text tag="private">Secret</Text>
          </Picker>
          <Toggle
            title="只看收藏"
            value={filter.favoritesOnly}
            onChanged={value => updateSettings({ gistFilter: { ...filter, favoritesOnly: value } })}
          />
          <Toggle
            title="只看有未同步修改"
            value={filter.draftsOnly}
            onChanged={value => updateSettings({ gistFilter: { ...filter, draftsOnly: value } })}
          />
        </Section>

        <Section>
          <HStack spacing={8}>
            <Image systemName="line.3.horizontal.decrease.circle" foregroundStyle="systemBlue" />
            <Text font="footnote" foregroundStyle="secondaryLabel">
              修改会立即生效，点「完成」关闭。
            </Text>
          </HStack>
        </Section>
      </List>
    </NavigationStack>
  )
}
