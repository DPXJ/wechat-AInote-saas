# Signal Deck 技术架构

## 1. 产品目标

这个版本不做微信直连，先把价值闭环跑通：

- 手动录入微信里的文本、图片、PDF、文档、视频备注
- 存原文与原文件
- 生成摘要、关键词、行动项
- 支持“带出处”的 AI 搜索
- 同步到 Notion 和滴答清单邮箱

## 2. 核心设计原则

- `Source of truth` 不放在 Notion，而是放在系统自己的数据库和文件存储层
- `Search first`，任何答案都必须能回到原始资料和上下文
- `Adapter first`，同步目标是适配器，不反过来绑死主数据
- `OSS ready`，当前本地文件存储，后续一层替换为 OSS/S3/COS 即可

## 3. 当前实现

### 前端

- `src/app/page.tsx`
  - 收件箱首页
  - 资料录入表单
  - AI 搜索台
  - 最近资料卡片

- `src/app/records/[id]/page.tsx`
  - 资料详情
  - 附件查看
  - 同步动作
  - 同步历史

### 后端

- `src/app/api/records/route.ts`
  - 新建资料
  - 列出最近资料

- `src/app/api/search/route.ts`
  - 关键词/向量混合检索

- `src/app/api/records/[id]/sync/route.ts`
  - 同步到 Notion / 滴答邮件

- `src/app/api/assets/[id]/route.ts`
  - 附件访问入口

### 数据层

- SQLite: 资料元数据、文本切块、同步历史
- Local storage: 原始附件
- OpenAI: 可选的摘要与 embedding provider

## 4. 数据模型

### records

- 基础字段：标题、来源、类型、原始文本、抽取文本、摘要、备注
- 分析字段：关键词、行动项、建议同步目标

### assets

- 原文件名
- MIME type
- 文件大小
- 存储 key

### chunks

- 切块内容
- 命中原因
- embedding

### sync_runs

- 同步目标
- 状态
- 外部引用 ID
- 错误信息

## 5. 搜索策略

当前搜索分 2 层：

1. SQLite FTS5 关键词检索
2. 如果配置了 OpenAI embedding，则追加语义相似度重排

返回结果时，系统会给出：

- 命中的资料标题
- 来源标签
- 相关片段
- 命中原因

这保证了“AI 搜索”不是一句黑盒答案，而是可追溯检索。

## 6. 为什么 Notion 不是主存储

- Notion 更适合做页面展示和协作沉淀
- 附件与搜索能力不适合作为你自己的原始资料库
- 一旦你要做重解析、重建索引、带引用搜索，自己的数据层会更稳

## 7. 下一步建议

- 接入 OSS 适配器，替换本地文件存储
- 为图片补 OCR provider
- 为音视频补转写流程
- 增加飞书文档适配器
- 增加后台任务队列，避免大文件阻塞请求
- 增加登录、项目空间、标签和权限控制
