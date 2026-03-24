#!/usr/bin/env bash
# 在阿里云服务器上执行：生成专用于 GitHub 的 SSH 密钥，并配置 git@github.com
# 用法：bash scripts/setup-github-ssh-deploy.sh
# 然后：把脚本打印的公钥添加到 GitHub → 仓库 Settings → Deploy keys（只读即可）
set -euo pipefail

KEY="${HOME}/.ssh/id_ed25519_github"
CONFIG="${HOME}/.ssh/config"

echo "==> 1) 生成密钥（若已存在则跳过）"
if [[ ! -f "$KEY" ]]; then
  ssh-keygen -t ed25519 -C "aliyun-deploy-$(hostname)" -f "$KEY" -N ""
  chmod 600 "$KEY"
  chmod 644 "${KEY}.pub"
else
  echo "    已存在: $KEY"
fi

echo ""
echo "==> 2) 写入 ~/.ssh/config（仅 github.com 使用此密钥）"
mkdir -p "${HOME}/.ssh"
chmod 700 "${HOME}/.ssh"
if [[ -f "$CONFIG" ]] && grep -q "Host github.com" "$CONFIG" 2>/dev/null; then
  echo "    已存在 Host github.com 配置，请手动确认 IdentityFile 为: $KEY"
else
  {
    echo ""
    echo "Host github.com"
    echo "  HostName github.com"
    echo "  User git"
    echo "  IdentityFile $KEY"
    echo "  IdentitiesOnly yes"
  } >> "$CONFIG"
  chmod 600 "$CONFIG"
fi

echo ""
echo "================================================================"
echo "【下一步】复制下面整行公钥，添加到 GitHub："
echo "  仓库 → Settings → Deploy keys → Add deploy key"
echo "  标题随意（如 aliyun-signal-deck），只读即可（不必勾选 Write）"
echo "  链接: https://github.com/DPXJ/wechat-AInote-saas/settings/keys"
echo "================================================================"
cat "${KEY}.pub"
echo "================================================================"
echo ""

echo "==> 3) 添加完公钥后，在本机再执行一次测试："
echo "    ssh -T git@github.com"
echo "    成功应看到: Hi <username>/<repo>! You've successfully authenticated..."
echo ""
echo "==> 4) 将仓库改为 SSH 并拉代码："
echo "    cd /var/www/signal-deck   # 按你实际目录"
echo "    git remote set-url origin git@github.com:DPXJ/wechat-AInote-saas.git"
echo "    git fetch origin && git pull origin master"
echo "    ./scripts/aliyun-deploy.sh"
echo ""
