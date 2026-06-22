#!/usr/bin/env bash
# 把 Node 后端打包成 Tauri sidecar 负载：
#   - src-tauri/binaries/taskdeck-node-<triple>   原生 node 运行时（externalBin）
#   - src-tauri/sidecar-server/                   编译后的 server + 生产依赖（→ 随包 resources/server）
# 仅针对 Apple Silicon (aarch64-apple-darwin)。
set -euo pipefail
cd "$(dirname "$0")/.." # → app/

TRIPLE="aarch64-apple-darwin"
SRV="server"
OUT="src-tauri/sidecar-server"
BIN="src-tauri/binaries"

echo "[1/4] 编译后端 (tsc)"
npm --prefix "$SRV" run build

echo "[2/4] 暂存 dist + package.json"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$SRV"/dist/. "$OUT"/
cp "$SRV"/package.json "$OUT"/

echo "[3/4] 安装生产依赖（含 better-sqlite3 原生模块）"
(cd "$OUT" && npm install --omit=dev --no-package-lock --no-audit --no-fund --silent)

# 瘦身：发布版只走 DeepSeek（纯 fetch，零 @anthropic-ai 依赖），剔除 Claude Agent SDK
# 及其平台原生二进制（~219MB）。本机开发用的 server/node_modules 不受影响。
# 仅 server/src/ai/sdkProvider.ts 引用它，且 getProvider() 为动态 import：发布版强制 DeepSeek
# 不会触达该路径，万一触达也会被 routes/tasks.ts 的 try/catch 降级，不致崩溃。
if [ -d "$OUT/node_modules/@anthropic-ai" ]; then
  echo "      → 剔除 @anthropic-ai（发布版瘦身，仅保留 DeepSeek 路径）"
  rm -rf "$OUT/node_modules/@anthropic-ai"
  # 删包后 .bin 里会留下指向它的悬空软链（如 anthropic-ai-sdk → ../@anthropic-ai/sdk/bin/cli），
  # Tauri 打包资源时解析这些断链会报 "resource path ... doesn't exist" 而失败。
  # 用 `find -L -type l` 仅清理断链（有效软链会被解析为目标类型，不会误删）。
  find -L "$OUT/node_modules" -type l -exec rm -f {} + 2>/dev/null || true
fi

echo "[4/4] 取官方标准 node 运行时为 sidecar 二进制"
# 用官方发行版的 node（约 50MB）替代直接拷贝本机 node（本机那个偏大，~229MB）。
# 版本锁定为本机 node 版本：上一步 better-sqlite3 原生模块按本机 node ABI 编译，
# 运行时 node 必须同 ABI（同 major 版本），否则 require 原生模块会 NODE_MODULE_VERSION 不匹配。
NODE_VER="$(node -v)" # 形如 v24.14.0
NODE_DIST="node-${NODE_VER}-darwin-arm64"
CACHE_DIR="$HOME/.cache/taskdeck-node"
NODE_BIN="$CACHE_DIR/$NODE_DIST/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  echo "      → 下载官方 node ${NODE_VER}（首次，之后走缓存 ${CACHE_DIR}）"
  mkdir -p "$CACHE_DIR"
  curl -fsSL "https://nodejs.org/dist/${NODE_VER}/${NODE_DIST}.tar.xz" -o "$CACHE_DIR/$NODE_DIST.tar.xz"
  tar -xJf "$CACHE_DIR/$NODE_DIST.tar.xz" -C "$CACHE_DIR"
  rm -f "$CACHE_DIR/$NODE_DIST.tar.xz"
fi
mkdir -p "$BIN"
cp "$NODE_BIN" "$BIN/taskdeck-node-$TRIPLE"
chmod +x "$BIN/taskdeck-node-$TRIPLE"
echo "      → sidecar node 体积：$(du -h "$BIN/taskdeck-node-$TRIPLE" | cut -f1)（官方 ${NODE_VER}）"

echo "✓ 完成：$OUT 与 $BIN/taskdeck-node-$TRIPLE 就绪"
