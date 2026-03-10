## Signal Deck

Signal Deck 是一个面向“微信资料手动同步”场景的 SaaS MVP。

它解决的是这条链路：

- 手动把微信里的文本、截图、PDF、文档同步到网页收件箱
- 保存原文和原文件
- 自动生成摘要、关键词、行动项
- 支持可追溯的 AI 搜索
- 一键同步到 Notion 或滴答清单邮箱

## 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- SQLite + FTS5
- 本地文件存储适配层（后续可切 OSS）
- OpenAI Provider（可选）
- Notion / SMTP 适配器

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

打开 [http://localhost:3000](http://localhost:3000)。

## 可选配置

- 如果不配置 OpenAI，也可以运行；这时使用启发式摘要和关键词
- 如果配置 `NOTION_TOKEN` + `NOTION_PARENT_PAGE_ID`，可以同步到 Notion 子页面
- 如果配置 SMTP 和 `TICKTICK_INBOX_EMAIL`，可以把待办邮件投递到滴答清单中国版

## 当前支持的资料类型

- 文本粘贴
- TXT / MD / CSV / JSON
- PDF
- DOCX
- 其他类型文件会先保留原附件和手动备注

## 目录说明

- `src/app/page.tsx`: 收件箱首页
- `src/app/records/[id]/page.tsx`: 资料详情页
- `src/lib/records.ts`: 入库与索引服务
- `src/lib/search.ts`: 搜索服务
- `src/lib/sync.ts`: Notion / 滴答邮件同步
- `docs/architecture.md`: 技术架构说明

## 后续演进

- 接 OSS / COS / S3
- 补图片 OCR
- 补音视频转写
- 接飞书文档
- 加用户体系与项目空间

详细设计见 [docs/architecture.md](docs/architecture.md)。
