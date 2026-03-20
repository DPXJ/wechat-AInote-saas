# 阿里云轻量服务器：远程连接 + 尽量「一键」部署

把复杂步骤拆成两件事：**先连上服务器**，**再在服务器上跑脚本**。你只需要复制粘贴。

> **本机是 Windows、代码在 GitHub？** 直接看 **[deploy-windows-github.md](./deploy-windows-github.md)**（从 `git push` 到服务器一键部署的清单）。

---

## 一、远程连接服务器（3 种方式，任选一种）

### 方式 A：浏览器里连（最简单，不用装软件）

1. 登录 [阿里云控制台](https://ecs.console.aliyun.com/) → **轻量应用服务器**。
2. 点进你的那台服务器 → 找到 **远程连接** / **Workbench 远程连接**。
3. 用控制台里设置的 **root 密码**（或密钥）登录。  
   这就是一台 Linux 终端，可以直接敲命令。

适合：先装环境、第一次排查问题。

---

### 方式 B：自己电脑用 SSH（以后改代码、部署常用）

**需要知道：** 服务器 **公网 IP**、**用户名**（一般是 `root`）、**密码** 或 **密钥文件**。

#### Windows（PowerShell 或 CMD）

1. 按 `Win + R`，输入 `powershell`，回车。
2. 执行（把 `你的公网IP` 换成真实 IP）：

```bash
ssh root@你的公网IP
```

3. 第一次会问 `Are you sure you want to continue connecting?`，输入 `yes` 回车。
4. 输入 **root 密码**（输入时不会显示星号，正常现象），回车。

#### Mac / Linux

打开「终端」，同样执行：

```bash
ssh root@你的公网IP
```

#### 连不上时检查

- 轻量服务器 **防火墙** 是否放行 **22** 端口。
- 阿里云 **安全组/防火墙** 里 SSH 是否允许你的网络。

---

### 方式 C：用 SSH 密钥（更安全，可选）

在阿里云轻量控制台可以 **绑定密钥对** 或本机生成密钥后把公钥放到服务器 `~/.ssh/authorized_keys`。  
新手先用 **密码** 即可，会了再换密钥。

---

## 二、部署在干什么（一句话）

你的项目是 **Next.js**：服务器上要装 **Node.js**，用 **`pnpm build`** 打包，用 **`pnpm start`** 跑起来，再用 **Nginx** 把域名 **HTTPS** 转到本机 **3000** 端口。**数据库用 Supabase**，不用在服务器上装数据库。

---

## 三、第一次：服务器上「一键装环境」（只做一次）

1. 用 **方式 A 或 B** 登录服务器，确保是 **root**（或能用 `sudo`）。
2. 把项目代码放到服务器（任选其一）：
   - **Git**：`git clone 你的仓库地址` 到例如 `/var/www/signal-deck`
   - 或 **本机打包上传**：用 WinSCP / `scp` 把项目文件夹传上去
3. 在项目仓库里我们提供了脚本，你也可以在服务器上直接下载仓库后执行：

```bash
cd /var/www/signal-deck   # 换成你实际目录
chmod +x scripts/aliyun-first-install.sh
sudo ./scripts/aliyun-first-install.sh
```

脚本会安装：**Node 20、pnpm、PM2、Nginx**（按提示来）。

4. 在服务器项目根目录创建 **`.env.production`**（不要提交到 Git），至少包含：

```env
APP_BASE_URL=https://你的二级域名
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的anon
SUPABASE_SERVICE_ROLE_KEY=你的service_role
```

（其他变量按你本地 `.env` 对照填写。）

5. **Supabase 控制台** → Authentication → URL：把 **Site URL**、**Redirect URLs** 改成你的 `https://你的二级域名`。

6. **域名解析**：在阿里云 DNS 给二级域名加 **A 记录** 指向轻量 **公网 IP**。

7. 再执行一次「部署脚本」（见下一节），然后去 **Nginx + HTTPS**（见 `scripts/aliyun-nginx-ssl-example.sh` 里的说明或下面文档里的 certbot）。

---

## 四、以后每次更新：一条命令部署

代码已上传到服务器、`.env.production` 已配置后，在服务器上：

```bash
cd /var/www/signal-deck
chmod +x scripts/aliyun-deploy.sh
./scripts/aliyun-deploy.sh
```

脚本会：`git pull`（若你是 git 部署）→ `pnpm install` → `pnpm build` → `pm2 restart`。

若你 **不用 git**，只用上传 zip，则手动解压覆盖后，在目录里执行：

```bash
pnpm install && pnpm build && pm2 restart signal-deck
```

（名称以你 `pm2` 里为准。）

---

## 五、HTTPS（证书）——仍要执行一次，但可复制命令

装好 Nginx 后，用 **Certbot**（免费证书）：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的二级域名
```

按提示选 **重定向 HTTP 到 HTTPS**。之后 Nginx 会自动改好。

---

## 六、还想更「一键」？

- **本地**：用 **Git** 推代码，**服务器**只负责 `git pull` + `./scripts/aliyun-deploy.sh`（已是最简流水线）。
- **进阶**：可配置 **GitHub Actions**，推送后自动 SSH 到服务器执行 `aliyun-deploy.sh`（需要把服务器 SSH 密钥存到 GitHub Secrets）。

---

## 七、脚本说明

| 文件 | 作用 |
|------|------|
| `scripts/aliyun-first-install.sh` | 首次：安装 Node / pnpm / PM2 / Nginx |
| `scripts/aliyun-deploy.sh` | 每次：拉代码、构建、PM2 重启 |
| `scripts/aliyun-nginx-ssl-example.sh` | 生成 Nginx 配置片段（可选） |

---

## 八、常见问题

**Q：我记不住命令怎么办？**  
A：把本文档保存到手机备忘录，或打印「连接 SSH + 一行 `./scripts/aliyun-deploy.sh`」。

**Q：PM2 里应用名叫什么？**  
A：第一次 `aliyun-deploy.sh` 会用 `signal-deck` 作为名称（可改脚本里的 `APP_NAME`）。

**Q：网站打不开？**  
A：查 **防火墙 80/443**、**域名是否解析到这台 IP**、**PM2 是否 `online`**：`pm2 status`。

---

有问题就按顺序排查：**能 SSH → 能 `pm2 status` → 能 `curl localhost:3000` → 能 `curl https://域名`**。
