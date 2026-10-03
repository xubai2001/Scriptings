/** 仓库列表行（§42：不使用大卡片，每行 70~80pt） */

import {
  Button,
  Group,
  HStack,
  Image,
  NavigationLink,
  Spacer,
  Text,
  VStack,
} from "scripting"
import { Repository } from "../types"
import { isFavoriteRepo, toggleFavoriteRepo } from "../services/store"
import { emitters } from "../utils/emitter"
import { relativeTime } from "../utils/format"

export function RepositoryRow({ repo, showFavorite = true }: { repo: Repository; showFavorite?: boolean }) {
  const favorite = showFavorite && isFavoriteRepo(repo.fullName)
  return (
    <VStack alignment="leading" spacing={3} padding={{ vertical: 5 }}>
      <HStack spacing={6}>
        <Text font="headline" lineLimit={1}>
          {repo.name}
        </Text>
        {repo.isPrivate ? (
          <Image systemName="lock.fill" imageScale="small" foregroundStyle="tertiaryLabel" />
        ) : null}
        <Spacer />
        {favorite ? <Image systemName="star.fill" imageScale="small" foregroundStyle="systemYellow" /> : null}
      </HStack>
      <Text font="footnote" foregroundStyle="secondaryLabel" lineLimit={1}>
        {repo.fullName}
      </Text>
      <HStack spacing={8}>
        <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
          {repo.description || repo.language || "暂无描述"}
        </Text>
        <Spacer />
        <Text font="caption" foregroundStyle="tertiaryLabel">
          {relativeTime(repo.pushedAt)}
        </Text>
      </HStack>
    </VStack>
  )
}

/** 带跳转与长按菜单的仓库行 */
export function RepositoryLink({
  repo,
  destination,
}: {
  repo: Repository
  destination: any
}) {
  const favorite = isFavoriteRepo(repo.fullName)
  const url = repo.htmlURL || `https://github.com/${repo.fullName}`
  return (
    <NavigationLink
      destination={destination}
      contextMenu={{
        menuItems: (
          <Group>
            <Button
              title={favorite ? "取消收藏" : "收藏"}
              systemImage={favorite ? "star.slash" : "star"}
              action={() => {
                toggleFavoriteRepo(repo.fullName)
                emitters.favorites.emit()
              }}
            />
            <Button
              title="复制仓库地址"
              systemImage="doc.on.doc"
              action={async () => {
                await Pasteboard.setString(url)
              }}
            />
            <Button
              title="分享"
              systemImage="square.and.arrow.up"
              action={async () => {
                await ShareSheet.present([url])
              }}
            />
            <Button
              title="在浏览器打开"
              systemImage="safari"
              action={async () => {
                await Safari.openURL(url)
              }}
            />
          </Group>
        ),
      }}
      trailingSwipeActions={{
        allowsFullSwipe: true,
        actions: [
          <Button
            title={favorite ? "取消收藏" : "收藏"}
            systemImage={favorite ? "star.slash.fill" : "star.fill"}
            action={() => {
              toggleFavoriteRepo(repo.fullName)
              emitters.favorites.emit()
            }}
          />,
        ],
      }}
    >
      <RepositoryRow repo={repo} />
    </NavigationLink>
  )
}

/** 只有名字（收藏里找不到元数据时的占位） */
export function placeholderRepository(fullName: string): Repository {
  const parts = fullName.split("/")
  return {
    id: 0,
    name: parts[1] || fullName,
    fullName,
    owner: parts[0] || "",
    description: "",
    defaultBranch: "main",
    updatedAt: "",
    pushedAt: "",
    htmlURL: `https://github.com/${fullName}`,
    stars: 0,
    forks: 0,
    language: null,
    isPrivate: false,
    isFork: false,
    isArchived: false,
    createdAt: "",
    sizeKB: 0,
  }
}
