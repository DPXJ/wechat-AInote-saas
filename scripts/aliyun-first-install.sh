#!/usr/bin/env bash
# 首次在 Ubuntu/Debian 轻量服务器上安装：Node 20、pnpm、PM2、Nginx
# 用法：sudo bash scripts/aliyun-first-install.sh

set -euo pipefail

echo "==> 1/4 安装基础工具"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg git nginx

echo "==> 2/4 安装 Node.js 20.x"
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> 3/4 全局安装 pnpm、PM2"
npm install -g pnpm pm2

echo "==> 4/4 完成"
echo "Node: $(node -v)  pnpm: $(pnpm -v)  pm2: $(pm2 -v)"
echo ""
echo "下一步："
echo "  1) 把项目放到 /var/www/signal-deck（或任意目录），并配置 .env.production"
echo "  2) 在该目录执行: chmod +x scripts/aliyun-deploy.sh && ./scripts/aliyun-deploy.sh"
echo "  3) 配置 Nginx 反代到 127.0.0.1:3000，并用 certbot 申请 HTTPS"
echo "  详见 docs/deploy-aliyun-simple.md"
