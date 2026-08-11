# AI 信迹 Mac 0.1

这是 AI 信迹的原生 SwiftUI Mac 客户端，不是 Electron 或 WebView 套壳。

## 0.1 功能

- 邮箱密码登录 Supabase
- Keychain 保存登录状态
- 文件时间线列表
- 时间线搜索：文件名、标签、来源、摘要、OCR、文档抽取内容
- 文件详情：AI 摘要、来源描述、自动标签、OCR / 抽取文本
- 用 Bearer Token 下载附件并调用 macOS 打开
- 打包生成可双击打开的 `.app` 和 `.dmg`

## 打包

在仓库根目录有 `.env.local` 时，脚本会读取 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 并写入 App 的 `Info.plist`。

```bash
cd apps/macos
./scripts/package-app.sh
```

输出：

- `apps/macos/dist/AI 信迹.app`
- `apps/macos/dist/AI 信迹-0.1.0.dmg`

## 迭代方向

- 0.2：剪贴板监听与本地队列
- 0.3：菜单栏快速收藏
- 0.4：原生图片/PDF 内嵌预览

