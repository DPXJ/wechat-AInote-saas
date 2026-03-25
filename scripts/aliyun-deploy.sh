#!/usr/bin/env bash
# 在服务器项目根目录执行：安装依赖、构建、用 PM2 启动/重启
# 用法：./scripts/aliyun-deploy.sh
# 环境变量 APP_DIR 可覆盖项目目录（默认当前目录）

set -euo pipefail

APP_NAME="${APP_NAME:-signal-deck}"
ROOT="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

echo "==> 项目目录: $ROOT"

if [[ ! -f "package.json" ]]; then
  echo "错误：未找到 package.json，请在项目根目录执行，或设置 APP_DIR"
  exit 1
fi

if [[ -d ".git" ]]; then
  echo "==> git pull"
  git pull --rebase || git pull
fi

echo "==> npm ci（与 package-lock.json 一致；无 lock 时勿用 npm ci）"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install --omit=dev
fi

echo "==> npm run build"
export NODE_ENV=production
npm run build

echo "==> PM2 启动或重启"
if pm2 describe "$APP_NAME" &>/dev/null; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start npm --name "$APP_NAME" -- start
  pm2 save
fi

pm2 status "$APP_NAME"
echo ""
echo "==> 完成。若已配置 Nginx，请访问 https://你的域名"
echo "  本机自检: curl -sI http://127.0.0.1:3000 | head -1"
