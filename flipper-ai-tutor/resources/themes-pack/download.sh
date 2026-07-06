#!/bin/bash
# DolphinTutor 主题包下载脚本
#
# 主题文件来自以下社区仓库，各自有其独立的许可证
# 因许可证不确定性，本仓库不直接包含主题文件
# 用户运行此脚本自动下载到本目录
#
# 来源1: https://github.com/naisatoh/Psyduck-Asset-Pack
# 来源2: https://github.com/WillyJL/Flipper-WatchDogs-AssetPack
#
# 注意: 请确认各主题的许可证后再使用

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP_DIR="$(mktemp -d)"

echo "DolphinTutor 主题包下载工具"
echo ""

# 下载 Psyduck 主题
echo "[1/2] 下载 Psyduck 主题..."
curl -sL -o "$TMP_DIR/psyduck.zip" \
  "https://github.com/naisatoh/Psyduck-Asset-Pack/archive/refs/heads/main.zip"
unzip -q -o "$TMP_DIR/psyduck.zip" -d "$TMP_DIR/"
cp -r "$TMP_DIR/Psyduck-Asset-Pack-main/Psyduck" "$SCRIPT_DIR/"
echo "  ✓ Psyduck (来源: naisatoh/Psyduck-Asset-Pack)"

# 下载 WatchDogs 主题
echo "[2/2] 下载 WatchDogs 主题..."
curl -sL -o "$TMP_DIR/watchdogs.zip" \
  "https://github.com/WillyJL/Flipper-WatchDogs-AssetPack/archive/refs/heads/main.zip"
unzip -q -o "$TMP_DIR/watchdogs.zip" -d "$TMP_DIR/"
cp -r "$TMP_DIR/Flipper-WatchDogs-AssetPack-main/WatchDogs" "$SCRIPT_DIR/"
echo "  ✓ WatchDogs (来源: WillyJL/Flipper-WatchDogs-AssetPack)"

# 清理
rm -rf "$TMP_DIR"

echo ""
echo "完成！2 套主题已下载到 $SCRIPT_DIR"
echo "许可证: 请查看各主题仓库的 LICENSE 文件"
echo "  Psyduck:   https://github.com/naisatoh/Psyduck-Asset-Pack"
echo "  WatchDogs: https://github.com/WillyJL/Flipper-WatchDogs-AssetPack"
