# Lucy

AI 增强的口袋多功能工具。USB-C 连电脑，设备端做射频/NFC/红外/GPIO，AI 跑在云端。

## 这是什么

简单说就是一把"会说话的瑞士军刀"：硬件端集成 Sub-GHz、NFC、红外、BadUSB、GPIO，通过 USB 连 PC，用你自己的大模型 API Key 做 AI 辅助。不是 AI 伴侣，就是个工具。

和 Flipper Zero 的区别：没有电池续航（插电用）、没有无线（纯 USB）、AI 是原生的（不是外挂）。

## 当前进度

规格书 v1.2.1，已过评审，准备画板子。

- 主控：ESP32-S3-WROOM-1-N8R8
- 射频：CC1101 + 屏蔽罩
- NFC：ST25R3916（带 AAT 调谐）
- 桌面端：Tauri 2.0（Rust + React）
- 固件：ESP-IDF v5.4

BOM 大概 ¥142（原型），量产能压到 ¥60 左右。

## 目录

```
docs/
  prd/          规格书（看这个）
  research/     Flipper One 调研
  handoff/      硬件/固件交接清单
  archive/      早期文档，别看了
hardware/       KiCad（待创建）
firmware/       ESP-IDF（待创建）
desktop/        Tauri 桌面端（待创建）
assets/fonts/   像素字体
```

## 开发计划

大概 11 周，面包板验证 → PCB 打样 → 驱动开发 → 调试 → 内测。NFC 天线是最不确定的部分，预留了 2-3 次改板。

## 技术选型理由

- **ESP32-S3 而不是 STM32**：USB OTG 原生支持，PSRAM 大内存，省一个 USB 芯片
- **USB-C 供电不要电池**：省空间省成本，PC 提供无限算力
- **Tauri 而不是 Electron**：包小，Rust 后端安全
- **用户自带 API Key**：我们不付 AI 费用，用户用自己的

## License

待定。
