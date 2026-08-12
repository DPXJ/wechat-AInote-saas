# AI 信迹 Mac

这是 AI 信迹的原生 SwiftUI Mac 客户端，不是 Electron 或 WebView 套壳。

## 当前版本

- `0.01`：第一版原生客户端
- `0.02`：文件时间线按日期分组、图片预览、收藏同步、复制链接、网页录入入口
- `0.03`：窗口可拖动、补齐收藏/信源/待办入口、恢复线上本地附件预览
- `0.05`：详情栏可拖拽/收起、原生文本录入、剪贴板读取与待办识别
- `0.06`：详情收起后时间线全宽展开、卡片/按钮悬浮动效、顶部双击缩放、原生录入支持文件上传

后续每次打包都使用新的版本号输出独立 `.app` 和 `.dmg`，不会覆盖旧包。

## 功能

- 邮箱密码登录 Supabase
- Keychain 保存登录状态
- 文件时间线列表
- 时间线搜索：文件名、标签、来源、摘要、OCR、文档抽取内容
- 文件详情：AI 摘要、来源描述、自动标签、OCR / 抽取文本
- 用 Bearer Token 下载附件并调用 macOS 打开
- 图片缩略图预览
- 收藏同步
- 复制附件链接
- 原生录入文本、剪贴板内容和本地文件
- 打包生成可双击打开的 `.app` 和 `.dmg`

## 打包

在仓库根目录有 `.env.local` 时，脚本会读取 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 并写入 App 的 `Info.plist`。

```bash
cd apps/macos
./scripts/package-app.sh
```

指定下一个版本：

```bash
APP_VERSION=0.06 ./scripts/package-app.sh
```

输出：

- `apps/macos/dist/AI 信迹 0.06.app`
- `apps/macos/dist/AI 信迹-0.06.dmg`

## 迭代方向

- 0.07：菜单栏快速收藏
- 0.08：PDF 内嵌预览
- 0.09：文件拖拽上传
