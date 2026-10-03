import { Navigation, Script } from "scripting"
import { markExiting } from "./services/lifecycle"
import { RootView } from "./views/RootView"

async function run() {
  await Navigation.present({
    element: <RootView />,
    modalPresentationStyle: "fullScreen",
  })
  // 页面被正常关闭（左上角 ✕ 或系统手势）：释放脚本实例
  markExiting()
  Script.exit()
}

run().catch(async e => {
  await Dialog.alert({ title: "Git Workbench", message: String(e) })
  markExiting()
  Script.exit()
})
