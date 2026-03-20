#!/usr/bin/env bash
# 仅打印 Nginx 配置示例 + certbot 命令，不直接改系统文件
# 用法：bash scripts/aliyun-nginx-ssl-example.sh 你的二级域名.com

set -euo pipefail
DOMAIN="${1:-app.example.com}"

cat <<EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1) 先确保 PM2 已跑 Next（端口 3000），见 scripts/aliyun-deploy.sh

2) 新建 Nginx 站点（请 sudo 编辑）:
   sudo nano /etc/nginx/sites-available/${DOMAIN}

内容示例（申请证书前可先用 HTTP 测试）：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
server {
    listen 80;
    server_name ${DOMAIN};
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

启用站点:
  sudo ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/
  sudo nginx -t && sudo systemctl reload nginx

3) 申请免费 HTTPS 证书:
  sudo apt install -y certbot python3-certbot-nginx
  sudo certbot --nginx -d ${DOMAIN}

4) 防火墙放行 80、443（轻量控制台 → 防火墙）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
域名: ${DOMAIN}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
