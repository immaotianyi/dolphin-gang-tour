#!/bin/bash
# DolphinTutor 游戏包下载脚本
#
# .fap 文件来自 xMasterX/all-the-plugins (GPL-3.0 许可)
# 因 GPL-3.0 再分发要求，本仓库不直接包含 .fap 二进制文件
# 用户运行此脚本自动下载到本目录
#
# 来源: https://github.com/xMasterX/all-the-plugins
# 许可证: GPL-3.0

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP_DIR="$(mktemp -d)"

echo "DolphinTutor 游戏包下载工具"
echo "来源: xMasterX/all-the-plugins (GPL-3.0)"
echo ""

# 下载 base 包
echo "[1/2] 下载 base 包..."
curl -sL -o "$TMP_DIR/base.zip" \
  "https://github.com/xMasterX/all-the-plugins/releases/latest/download/all-the-apps-base.zip"

# 下载 extra 包
echo "[2/2] 下载 extra 包..."
curl -sL -o "$TMP_DIR/extra.zip" \
  "https://github.com/xMasterX/all-the-plugins/releases/latest/download/all-the-apps-extra.zip"

# 解压
echo "解压中..."
unzip -q -o "$TMP_DIR/base.zip" -d "$TMP_DIR/base"
unzip -q -o "$TMP_DIR/extra.zip" -d "$TMP_DIR/extra"

# 复制游戏 .fap 文件
GAMES_DIR="$SCRIPT_DIR"
for f in game_2048 minesweeper_redux arkanoid flappy_bird; do
  src=$(find "$TMP_DIR/base" -name "${f}.fap" -print -quit 2>/dev/null)
  if [ -n "$src" ]; then
    cp "$src" "$GAMES_DIR/"
    echo "  ✓ $(basename "$src")"
  fi
done

for f in flipper_pong asteroids; do
  src=$(find "$TMP_DIR/extra" -name "${f}.fap" -print -quit 2>/dev/null)
  if [ -n "$src" ]; then
    cp "$src" "$GAMES_DIR/"
    echo "  ✓ $(basename "$src")"
  fi
done

# 清理
rm -rf "$TMP_DIR"

echo ""
echo "完成！6 个游戏 .fap 文件已下载到 $GAMES_DIR"
echo "许可证: 这些文件以 GPL-3.0 许可证分发"
echo "源代码: https://github.com/xMasterX/all-the-plugins"
