/**
 * 精选资源包定义
 *
 * 注意：此文件仅提供浏览器演示模式的 mock 数据。
 * 真实数据通过 IPC list_resource_packages / list_firmwares 从后端获取。
 * 后端 pipeline.rs 是数据单一来源（Single Source of Truth）。
 */
import type { ResourcePackage, FirmwareInfo } from "@/types";

/** 浏览器演示模式 mock 资源包（与后端 pipeline.rs 保持一致） */
export const MOCK_RESOURCE_PACKAGES: ResourcePackage[] = [
  {
    id: "ir-tv-remote-pack",
    name: "电视红外遥控包",
    description: "主流品牌电视红外遥控码（索尼/三星/小米）",
    category: "infrared",
    sizeBytes: 12 * 1024,
    fileCount: 3,
    targetPath: "/ext/infrared",
    defaultChecked: true,
    version: "1.0.0",
    apiLevelRequired: 1,
  },
  {
    id: "subghz-protocol-pack",
    name: "SubGHz 信号样本包",
    description: "门铃/遥控器 SubGHz 信号样本文件",
    category: "subghz",
    sizeBytes: 4 * 1024,
    fileCount: 2,
    targetPath: "/ext/subghz",
    defaultChecked: true,
    version: "1.0.0",
    apiLevelRequired: 1,
  },
  {
    id: "badusb-scripts-pack",
    name: "BadUSB 演示脚本包",
    description: "教育用 BadUSB 脚本（Hello World / 画心形），无恶意 payload",
    category: "badusb",
    sizeBytes: 2 * 1024,
    fileCount: 2,
    targetPath: "/ext/badusb",
    defaultChecked: false,
    version: "1.0.0",
    apiLevelRequired: 1,
  },
  {
    id: "games-pack",
    name: "游戏合集（需自行下载）",
    description: "FlipperZero 游戏为 .fap 二进制格式，请从 lab.flipper.net 应用目录下载后放入设备",
    category: "games",
    sizeBytes: 0,
    fileCount: 0,
    targetPath: "/ext/apps/Games",
    defaultChecked: false,
    version: "1.0.0",
    apiLevelRequired: 1,
  },
  {
    id: "themes-pack",
    name: "主题包（需 Momentum Asset Pack）",
    description: "主题需通过 Momentum 固件 Asset Pack 系统安装，详见 README",
    category: "themes",
    sizeBytes: 0,
    fileCount: 0,
    targetPath: "/ext/themes",
    defaultChecked: false,
    version: "1.0.0",
    apiLevelRequired: 1,
  },
];

/** 浏览器演示模式 mock 固件列表（与后端 flasher.rs 保持一致） */
export const MOCK_FIRMWARES: FirmwareInfo[] = [
  {
    id: "momentum",
    name: "Momentum Firmware",
    description: "功能最丰富的社区固件，推荐新手使用。包含 SubGHz 协议增强、BadUSB 脚本库、UI 主题等。",
    recommended: true,
    apiLevel: 1,
    downloadUrl: "https://github.com/Next-Flip/Momentum-Firmware/releases/latest",
    sizeBytes: 4 * 1024 * 1024,
    requiresDfu: false,
  },
  {
    id: "unleashed",
    name: "Unleashed Firmware",
    description: "经典社区固件，稳定可靠，提供丰富的 SubGHz 频段扩展。",
    recommended: false,
    apiLevel: 1,
    downloadUrl: "https://github.com/DarkFlippers/unleashed-firmware/releases/latest",
    sizeBytes: 4 * 1024 * 1024,
    requiresDfu: false,
  },
  {
    id: "ofw",
    name: "Official Firmware (OFW)",
    description: "Flipper Zero 官方固件，最稳定但功能较少。",
    recommended: false,
    apiLevel: 1,
    downloadUrl: "https://github.com/flipperdevices/flipperzero-firmware/releases/latest",
    sizeBytes: 4 * 1024 * 1024,
    requiresDfu: false,
  },
  {
    id: "roguemaster",
    name: "RogueMaster Firmware",
    description: "基于 OFW 的社区固件，包含额外游戏与工具。",
    recommended: false,
    apiLevel: 1,
    downloadUrl: "https://github.com/RogueMaster/flipperzero-firmware-wPlugins/releases/latest",
    sizeBytes: 4 * 1024 * 1024,
    requiresDfu: false,
  },
];
