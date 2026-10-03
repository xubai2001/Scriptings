/** 根视图：登录门 + 4 个 Tab（仓库 / Gist / 活动 / 设置） */

import { Tab, TabView, useObservable } from "scripting"
import { hasToken } from "../api/auth"
import { getSettings } from "../services/store"
import { emitters } from "../utils/emitter"
import { useWatch } from "../utils/hooks"
import { ActivityTab } from "./ActivityTab"
import { GistsTab } from "./GistsTab"
import { RepositoriesTab } from "./RepositoriesTab"
import { SettingsTab } from "./SettingsTab"
import { WelcomeView } from "./WelcomeView"

export function RootView() {
  useWatch(emitters.account, emitters.settings)
  const selection = useObservable(0)
  const appearance = getSettings().appearance

  if (!hasToken()) return <WelcomeView />

  return (
    <TabView
      selection={selection}
      preferredColorScheme={appearance === "system" ? undefined : appearance}
    >
      <Tab title="仓库" systemImage="folder" value={0}>
        <RepositoriesTab />
      </Tab>
      <Tab title="Gist" systemImage="doc.text" value={1}>
        <GistsTab />
      </Tab>
      <Tab title="活动" systemImage="clock.arrow.circlepath" value={2}>
        <ActivityTab />
      </Tab>
      <Tab title="设置" systemImage="gearshape" value={3}>
        <SettingsTab />
      </Tab>
    </TabView>
  )
}
