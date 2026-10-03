/** 首次启动：欢迎页（§4） */

import {
  Button,
  HStack,
  Image,
  Navigation,
  NavigationStack,
  Spacer,
  Text,
  VStack,
  useObservable,
} from "scripting"
import { ExitAppButton } from "./components"
import { TokenAuthView } from "./TokenAuthView"

export function WelcomeView() {
  const showAuth = useObservable(false)

  return (
    <NavigationStack>
      <VStack
        spacing={18}
        padding={{ horizontal: 28 }}
        navigationBarTitleDisplayMode="inline"
        toolbar={{ topBarLeading: <ExitAppButton /> }}
        sheet={{
          isPresented: showAuth,
          content: <TokenAuthView firstRun />,
        }}
      >
      <Spacer />
      <Image
        systemName="chevron.left.forwardslash.chevron.right"
        font={54}
        foregroundStyle="systemBlue"
      />
      <Text font="largeTitle" fontWeight="bold">
        Git Workbench
      </Text>
      <Text font="body" foregroundStyle="secondaryLabel" multilineTextAlignment="center">
        在 iPhone 上管理你的 GitHub 仓库与 Gist
      </Text>

      <VStack alignment="leading" spacing={10} padding={{ vertical: 10 }}>
        <HStack spacing={10}>
          <Image systemName="folder.badge.gearshape" foregroundStyle="systemBlue" />
          <Text font="callout">浏览仓库目录，直接预览代码</Text>
        </HStack>
        <HStack spacing={10}>
          <Image systemName="square.and.pencil" foregroundStyle="systemPurple" />
          <Text font="callout">随手编辑 Gist，改完一键同步</Text>
        </HStack>
        <HStack spacing={10}>
          <Image systemName="arrow.triangle.branch" foregroundStyle="systemGreen" />
          <Text font="callout">查看提交记录、分支与文件差异</Text>
        </HStack>
      </VStack>

      <Button
        title="使用 GitHub 登录"
        systemImage="person.crop.circle.badge.checkmark"
        buttonStyle="borderedProminent"
        action={() => showAuth.setValue(true)}
      />
      <Text font="footnote" foregroundStyle="tertiaryLabel" multilineTextAlignment="center">
        也可以稍后在设置中添加账户
      </Text>
      <Spacer />
      </VStack>
    </NavigationStack>
  )
}
