## AI 信迹

AI 信迹是一个面向“微信/飞书/网页资料收集”的个人知识收件箱。它可以保存文本、截图、PDF、Office 文档和其他附件，自动生成摘要、关键词、行动项，并把文件按日期归档到“文件时间线”。

## 线上发版（固定 3 步）

每次都按这个顺序做即可：

1. 本机提交并推送

```bash
git add .
git commit -m "你的改动说明"
git push origin master
```

2. SSH 到服务器并拉代码

```bash
ssh -i ~/.ssh/aliyun_signal_deck admin@123.57.226.34
cd /var/www/signal-deck
git pull
```

3. 构建并重启服务

```bash
npm ci
npm run build
pm2 delete signal-deck || true
pm2 start scripts/start-standalone.sh --name signal-deck
pm2 save
```

快速健康检查：

```bash
pm2 status
curl -I https://aixinji.linknewai.com
```

它解决的是这条链路：

- 手动把微信、飞书、网页里的文本、截图、PDF、文档同步到网页收件箱
- 保存原文和原文件
- 在“文件时间线”里按日期查看已收藏文件、标签、描述和来源信源
- 自动生成摘要、关键词、行动项
- 支持可追溯的 AI 搜索
- 一键同步到 Notion、Flomo 或滴答清单邮箱
- 提供 React Native / Expo 手机端和 SwiftUI Mac 端工程骨架，原生调用云端 API

## 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- Supabase Auth / Postgres
- 本地文件存储与阿里云 OSS 适配层
- OpenAI Provider（可选）
- Notion / SMTP / Flomo 适配器
- React Native / Expo 手机端
- SwiftUI Mac 端

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
copy .env.example .env.local
```

3. 启动开发环境

```bash
npm run dev
```

打开 [http://localhost:3100](http://localhost:3100)。

## Supabase 保活与健康检查

健康检查接口：

```bash
curl https://aixinji.linknewai.com/api/health
```

如果配置了 `HEALTHCHECK_TOKEN`，访问时带 token：

```bash
curl "https://aixinji.linknewai.com/api/health?token=你的token"
```

服务器本地保活：

```bash
npm run keepalive
```

推荐把 [scripts/cron.example](scripts/cron.example) 里的保活任务加入服务器 crontab。

## Supabase 定期备份

导出核心业务表：

```bash
npm run backup:supabase
```

默认输出到 `backups/`，可用 `BACKUP_DIR=/var/backups/signal-deck` 指定目录。备份文件是 gzip JSON，包含 records、assets、todos、projects、flash_memos 等核心表。

## 手机 App（React Native / Expo）

手机端在 [apps/mobile](apps/mobile) 下，是真正的 React Native App，不是 WebView。第一版已接入：

- Supabase 邮箱密码登录
- Bearer Token 调用云端 API
- 文件时间线列表
- 文件打开链接
- 最近记录列表
- 待办列表与新增待办
- 选择本机文件并保存到云端资料库

启动方式：

```bash
cd apps/mobile
cp .env.example .env
npm install --legacy-peer-deps
npm run start
```

`.env` 需要填写：

```env
EXPO_PUBLIC_APP_API_BASE_URL=https://aixinji.linknewai.com
EXPO_PUBLIC_SUPABASE_URL=https://你的项目.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=你的anon key
```

## Mac 桌面端（SwiftUI）

Mac 端在 [apps/macos](apps/macos) 下，是真正的 SwiftUI 原生客户端，不是 Electron/WebView。第一版已接入：

- Supabase 邮箱密码登录
- Bearer Token 调用云端 API
- Keychain 保存登录 token
- 文件时间线列表
- 打开云端文件链接
- `.app` 和 `.dmg` 打包脚本

运行方式：

```bash
cd apps/macos
AI_XINJI_API_BASE_URL=https://aixinji.linknewai.com \
AI_XINJI_SUPABASE_URL=https://你的项目.supabase.co \
AI_XINJI_SUPABASE_ANON_KEY=你的anon key \
swift run
```

打包：

```bash
cd apps/macos
AI_XINJI_API_BASE_URL=https://aixinji.linknewai.com \
AI_XINJI_SUPABASE_URL=https://你的项目.supabase.co \
AI_XINJI_SUPABASE_ANON_KEY=你的anon key \
./scripts/package-app.sh
```

## 可选配置

- 如果不配置 OpenAI，也可以运行；这时使用启发式摘要和关键词
- 如果配置 `NOTION_TOKEN` + `NOTION_PARENT_PAGE_ID`，可以同步到 Notion 子页面
- 如果配置 SMTP 和 `TICKTICK_INBOX_EMAIL`，可以把待办邮件投递到滴答清单中国版
- 如果配置 OSS，可把附件存储到对象存储，便于云端、PWA 和桌面端共享访问

## 当前支持的资料类型

- 文本粘贴
- TXT / MD / CSV / JSON
- PDF
- DOCX
- 其他类型文件会先保留原附件和手动备注

## 目录说明

- `src/app/page.tsx`: 收件箱首页
- `src/app/api/files/timeline/route.ts`: 文件时间线 API
- `src/app/api/health/route.ts`: 健康检查与 Supabase 保活
- `src/app/records/[id]/page.tsx`: 资料详情页
- `src/components/file-timeline-panel.tsx`: 文件时间线前端面板
- `src/lib/records.ts`: 入库与索引服务
- `src/lib/search.ts`: 搜索服务
- `src/lib/sync.ts`: Notion / 滴答邮件同步
- `scripts/keepalive.mjs`: 保活脚本
- `scripts/supabase-backup.mjs`: Supabase 备份脚本
- `apps/mobile`: React Native / Expo 手机端
- `apps/macos`: SwiftUI Mac 端
- `docs/architecture.md`: 技术架构说明

## 后续演进

- 飞书发送：配置飞书机器人或用户授权后，可把文件链接、摘要和标签发送到指定会话
- 微信发送：建议优先走企业微信机器人、公众号模板消息或系统分享；个人微信自动发送受官方能力限制
- 补音视频转写

详细设计见 [docs/architecture.md](docs/architecture.md)。
