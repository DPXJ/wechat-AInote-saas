# Windows + GitHub → 阿里云轻量：照着做清单

面向：**本机 Windows**、代码在 **GitHub**、服务器用我们项目里的脚本部署。

---

## 你需要先有的

- GitHub 仓库里已有本项目代码（或你已 `git push` 上去）
- 阿里云轻量服务器：**公网 IP**、**root 密码**（或密钥）
- 域名已在阿里云解析（二级域名 A 记录 → 服务器 IP）

---

## A. 本机 Windows（日常开发推代码）

### 1. 安装 Git（若还没有）

下载：https://git-scm.com/download/win  
安装时勾选 **Git Bash**，后面用起来方便。

### 2. 在项目文件夹里打开终端

- 在资源管理器进入项目目录，地址栏输入 `cmd` 回车，或  
- 右键 **「在终端中打开」** / **Git Bash Here**

### 3. 配置 Git 用户名邮箱（只做一次）

```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱@example.com"
```

### 4. 提交并推到 GitHub

```bash
git status
git add .
git commit -m "说明这次改了什么"
git push origin main
```

若你的主分支叫 `master`，把 `main` 改成 `master`。

---

## B. 连上阿里云服务器（两种方式任选）

### 方式 1：浏览器（不用装东西）

1. 登录 [阿里云控制台](https://ecs.console.aliyun.com/) → **轻量应用服务器**  
2. 点你的实例 → **远程连接** / **Workbench**  
3. 用 root 登录 → 出现黑色命令行窗口即可  

### 方式 2：Windows 自带终端（以后常用）

1. 按 `Win + R`，输入 `powershell`，回车  
2. 执行（IP 换成你的）：

```powershell
ssh root@你的公网IP
```

第一次输入 `yes`，再输入 root 密码（输入时不显示，正常）。

---

## C. 服务器上：从 GitHub 拉代码（第一次）

在 **服务器** 的终端里执行（把地址换成你的仓库）：

```bash
apt-get update -y && apt-get install -y git
mkdir -p /var/www && cd /var/www
git clone https://github.com/你的用户名/你的仓库名.git signal-deck
cd signal-deck
```

**若仓库是私有的**，GitHub 已不支持密码，需要任选其一：

- 在 GitHub → **Settings → Developer settings → Personal access tokens** 建一个 **classic token**（勾选 `repo`），克隆时用：  
  `git clone https://用户名:TOKEN@github.com/用户名/仓库.git`
- 或在服务器配置 **SSH 部署密钥**（略复杂，会了再用）

---

## D. 服务器上：环境变量（只做一次，很重要）

```bash
cd /var/www/signal-deck
nano .env.production
```

粘贴你的配置（至少包含 Supabase 等），**保存**：`Ctrl+O` 回车，`Ctrl+X` 退出。

> Next.js 生产会读 `.env.production`；不要用记事本在 Windows 里编辑再乱码上传，**在服务器上用 nano 编辑最稳**。

---

## E. 服务器上：一键装依赖 + 首次部署

```bash
cd /var/www/signal-deck
chmod +x scripts/aliyun-first-install.sh scripts/aliyun-deploy.sh
sudo bash scripts/aliyun-first-install.sh
./scripts/aliyun-deploy.sh
```

第一次会安装 Node / pnpm / PM2 / Nginx，并用 PM2 跑 `npm start`（端口 **3000**）。

检查：

```bash
pm2 status
curl -sI http://127.0.0.1:3000 | head -1
```

应看到 `200` 或 `30x`。

---

## F. Nginx + HTTPS（第一次）

1. 看示例（把域名换成你的二级域名）：

```bash
bash scripts/aliyun-nginx-ssl-example.sh app.你的域名.com
```

2. 按屏幕打印的说明，用 `nano` 建 Nginx 配置、`nginx -t`、`reload`。  
3. 安装证书：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.你的域名.com
```

4. 阿里云 **轻量防火墙** 放行 **80、443**。

5. 打开浏览器访问：`https://app.你的域名.com`

---

## G. Supabase（第一次）

控制台 → **Authentication → URL**：

- **Site URL**：`https://app.你的域名.com`
- **Redirect URLs** 加上：`https://app.你的域名.com/**`

---

## H. 以后每次更新（本机 + 服务器各一步）

**本机 Windows：**

```bash
git add .
git commit -m "更新说明"
git push origin main
```

**服务器 SSH 里：**

```bash
cd /var/www/signal-deck
./scripts/aliyun-deploy.sh
```

就完成发版。

---

## 常见问题（Windows）

| 现象 | 处理 |
|------|------|
| `ssh` 不是内部命令 | 安装 Git for Windows，或用 **设置 → 可选功能 → OpenSSH 客户端** |
| `git push` 要登录 | 用 GitHub 网页生成 **Personal Access Token** 当密码，或装 [GitHub CLI](https://cli.github.com/) `gh auth login` |
| 私库 clone 失败 | 用带 token 的 HTTPS 地址，或给服务器配 SSH 密钥 |

更通用的说明仍见：**[deploy-aliyun-simple.md](./deploy-aliyun-simple.md)**。
