#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
DIST="$ROOT/dist"
APP_NAME="AI 信迹"
BINARY="$ROOT/.build/release/AIXinjiMac"

APP_VERSION="${APP_VERSION:-0.02}"
APP="$DIST/$APP_NAME $APP_VERSION.app"
DMG="$DIST/$APP_NAME-$APP_VERSION.dmg"
README="$DIST/README-Mac-$APP_VERSION.txt"
API_BASE_URL="${AI_XINJI_API_BASE_URL:-https://aixinji.linknewai.com}"
SUPABASE_URL="${AI_XINJI_SUPABASE_URL:-}"
SUPABASE_ANON_KEY="${AI_XINJI_SUPABASE_ANON_KEY:-}"

if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_ANON_KEY" ]]; then
  for env_file in "$REPO_ROOT/.env.local" "$REPO_ROOT/.env.production" "$REPO_ROOT/.env"; do
    [[ -f "$env_file" ]] || continue
    SUPABASE_URL="${SUPABASE_URL:-$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$env_file" | tail -1 | cut -d= -f2-)}"
    SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$(grep -E '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$env_file" | tail -1 | cut -d= -f2-)}"
  done
fi

if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_ANON_KEY" ]]; then
  echo "缺少 Supabase 公共配置：请设置 AI_XINJI_SUPABASE_URL / AI_XINJI_SUPABASE_ANON_KEY，或在仓库 .env.local 填写 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY。" >&2
  exit 1
fi

plist_escape() {
  python3 - "$1" <<'PY'
import html
import sys
print(html.escape(sys.argv[1], quote=False))
PY
}

API_BASE_ESCAPED="$(plist_escape "$API_BASE_URL")"
SUPABASE_URL_ESCAPED="$(plist_escape "$SUPABASE_URL")"
SUPABASE_ANON_ESCAPED="$(plist_escape "$SUPABASE_ANON_KEY")"

cd "$ROOT"
swift build -c release

if [[ -e "$APP" || -e "$DMG" ]]; then
  echo "版本 $APP_VERSION 已存在：$APP 或 $DMG。请设置新的 APP_VERSION，例如 APP_VERSION=0.03 ./scripts/package-app.sh" >&2
  exit 1
fi

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BINARY" "$APP/Contents/MacOS/$APP_NAME"
cp "$ROOT/Resources/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>AI 信迹</string>
  <key>CFBundleIdentifier</key>
  <string>com.linknewai.aixinji.mac</string>
  <key>CFBundleName</key>
  <string>AI 信迹</string>
  <key>CFBundleDisplayName</key>
  <string>AI 信迹</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$APP_VERSION</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>AIXinjiAPIBaseURL</key>
  <string>$API_BASE_ESCAPED</string>
  <key>AIXinjiSupabaseURL</key>
  <string>$SUPABASE_URL_ESCAPED</string>
  <key>AIXinjiSupabaseAnonKey</key>
  <string>$SUPABASE_ANON_ESCAPED</string>
</dict>
</plist>
PLIST

cat > "$README" <<TXT
AI 信迹 Mac $APP_VERSION

打开方式：
1. 双击“AI 信迹 $APP_VERSION.app”。
2. 用网页端同一个邮箱和密码登录。
3. 登录后会自动同步文件时间线，可搜索、查看详情、打开或下载附件。

说明：
- 这是原生 SwiftUI Mac App，不是网页套壳。
- Supabase 公共配置已写入 App 包，双击即可使用。
- 若 macOS 提示无法验证开发者，请在系统设置 > 隐私与安全性中允许打开。
TXT

hdiutil create -volname "$APP_NAME $APP_VERSION" -srcfolder "$APP" -format UDZO "$DMG"
echo "$APP"
echo "$DMG"
