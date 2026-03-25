# 阿里云发版 SOP（signal-deck / AI 信迹）

发版目标：本地代码合并进主分支 → 服务器拉取 → 安装依赖 → 构建 → PM2 重启 → 线上版本号与功能一致。

---

## 一、给 AI 用的「一键提示词」（复制到 Cursor / 其它 AI）

把下面整段复制给 AI，让它按步骤帮你检查命令、补全遗漏（**不要**把服务器密码写进对话）：

```text
请按「signal-deck 阿里云发版 SOP」协助我发版：

【本地】
1. 确认 package.json 的 version 已 bump（若本次需要发新版号）
2. git status 干净后：git push origin master
3. 若 push 失败，先处理网络/代理再推送

【服务器】SSH：ssh root@123.57.226.34，项目目录：/var/www/signal-deck，PM2 应用名：signal-deck
执行顺序：
  cd /var/www/signal-deck
  git pull origin master
  npm ci
  npm run build
  pm2 restart signal-deck --update-env
  pm2 status
  pm2 logs signal-deck --lines 30

【验收】
- pm2 里 signal-deck 为 online
- 浏览器打开线上站点 → 设置页右侧显示 v{package.json 版本}
- 无 sh: next: command not found

【若 npm ci 失败 / better-sqlite3 报错】
- 先安装：dnf install -y gcc-c++ make python3
- 再删 node_modules 重 npm ci；仍失败则把完整报错贴出

【回滚】
  cd /var/www/signal-deck
  git log --oneline -5
  git checkout <上一版 commit>
  npm ci && npm run build && pm2 restart signal-deck
```

---

## 二、发版前检查（本地）

| 步骤 | 说明 |
|------|------|
| 1 | 功能自测通过 |
| 2 | **版本号**：需要对外可见时，改 `package.json` 的 `version`（如 `0.1.3`），提交并推送 |
| 3 | `git push origin master` 成功（构建注入 `NEXT_PUBLIC_APP_VERSION` 来自 `package.json`） |

---

## 三、服务器上固定信息（勿提交密码）

| 项 | 值 |
|----|-----|
| SSH | `ssh root@123.57.226.34` |
| 代码目录 | `/var/www/signal-deck` |
| PM2 名称 | `signal-deck` |
| 环境变量 | 项目根目录 `.env.production`（仅服务器上维护，不提交 Git） |

---

## 四、服务器发版命令（与当前线上一致：npm + PM2）

**方式 A：脚本（推荐）**

```bash
cd /var/www/signal-deck
chmod +x scripts/aliyun-deploy.sh
./scripts/aliyun-deploy.sh
```

**方式 B：手动（与脚本等价）**

```bash
cd /var/www/signal-deck
git pull origin master
npm ci
npm run build
pm2 restart signal-deck --update-env
pm2 status
```

---

## 五、验收

1. `pm2 status` → `signal-deck` 为 **online**  
2. `pm2 logs signal-deck --lines 20` → 无 **`next: command not found`**、无持续报错  
3. 浏览器打开线上站点 → **设置** → 标签栏右侧 **v x.x.x** 与本次 `package.json` 一致  

---

## 六、常见问题

| 现象 | 处理 |
|------|------|
| `npm ci` 在 better-sqlite3 失败 | `dnf install -y gcc-c++ make python3`，删 `node_modules` 再 `npm ci` |
| `sh: next: command not found` | 依赖未装好，勿重启 PM2；先让 `npm ci` / `npm run build` 成功 |
| `nvm: command not found` | 服务器未装 nvm；当前用系统 Node 即可，若需 Node 20 再单独装 |
| Node 版本过新 | 项目 Dockerfile 为 Node 20；若原生模块再出问题，可改用 Node 20 LTS |

---

## 七、相关文档与脚本

| 文件 | 用途 |
|------|------|
| `scripts/aliyun-deploy.sh` | 服务器上一键拉代码、构建、PM2 重启 |
| `docs/deploy-aliyun-simple.md` | 首次部署、SSH、Nginx 等总览 |
| `Dockerfile` | 容器化构建参考（线上若用 PM2 可忽略） |

---

## 八、版本号与发布节奏（建议）

- **小修复 / 体验优化**：`patch` +1（0.1.2 → 0.1.3）  
- **新功能**：`minor`（0.1.x → 0.2.0）  
- 发版前改 `package.json` → push → 服务器按第四节部署，设置页即可核对版本。
