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
ssh root@123.57.226.34
cd /var/www/signal-deck
git pull
```

3. 构建并重启服务

```bash
npm ci
npm run build
pm2 restart signal-deck --update-env
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
- 支持 PWA 安装到手机主屏幕，并提供 Mac 桌面端 Electron 壳

## 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- Supabase Auth / Postgres
- 本地文件存储与阿里云 OSS 适配层
- OpenAI Provider（可选）
- Notion / SMTP / Flomo 适配器
- Electron Mac 桌面端

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

## 手机 App（PWA）

生产环境已提供 Web App Manifest 和 Service Worker。用手机浏览器打开线上地址后，可以通过系统菜单添加到主屏幕：

- iOS Safari：分享 → 添加到主屏幕
- Android Chrome：菜单 → 安装应用

PWA 复用云端账号、文件时间线、历史信源、待办和设置，不需要单独维护一套后端。

## Mac 桌面端

桌面端使用 Electron 包一层云端应用。默认打开线上地址：

```bash
npm run desktop
```

如需指向其他环境：

```bash
AI_XINJI_DESKTOP_URL=http://localhost:3100 npm run desktop
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
- `src/app/records/[id]/page.tsx`: 资料详情页
- `src/components/file-timeline-panel.tsx`: 文件时间线前端面板
- `src/lib/records.ts`: 入库与索引服务
- `src/lib/search.ts`: 搜索服务
- `src/lib/sync.ts`: Notion / 滴答邮件同步
- `desktop/main.cjs`: Mac 桌面端 Electron 入口
- `docs/architecture.md`: 技术架构说明

## 后续演进

- 飞书发送：配置飞书机器人或用户授权后，可把文件链接、摘要和标签发送到指定会话
- 微信发送：建议优先走企业微信机器人、公众号模板消息或系统分享；个人微信自动发送受官方能力限制
- 桌面端打包 `.dmg`
- 补音视频转写

详细设计见 [docs/architecture.md](docs/architecture.md)。
