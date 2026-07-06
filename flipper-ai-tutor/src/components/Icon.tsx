/**
 * DolphinTutor — 高级SVG图标系统
 * 设计语言: 80s Retro Cyberpunk / 8-bit Pixel Art / 终端线条风
 * 全部为手工绘制的矢量SVG，不使用任何emoji
 * 描边宽度统一1.5px，端点方形，连接圆角，贴合像素美学
 */

import React from "react";

export type IconName =
  | "dolphin"
  | "chip"
  | "usb"
  | "battery"
  | "sd"
  | "wifi"
  | "radio"
  | "nfc"
  | "ir"
  | "subghz"
  | "badusb"
  | "gpio"
  | "terminal"
  | "rocket"
  | "wrench"
  | "search"
  | "package"
  | "mirror"
  | "trophy"
  | "pet"
  | "sandwich"
  | "translate"
  | "send"
  | "camera"
  | "clipboard"
  | "help"
  | "warning"
  | "save"
  | "refresh"
  | "power"
  | "lock"
  | "unlock"
  | "check"
  | "cross"
  | "chevron-right"
  | "chevron-down"
  | "dot"
  | "shield"
  | "brain"
  | "settings"
  | "folder"
  | "download"
  | "play"
  | "book"
  | "key"
  | "card"
  | "tv"
  | "antenna"
  | "circuit"
  | "bug";

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

const base = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  className,
  style: { shapeRendering: "crispEdges" as const },
});

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
};

// ====== 图标定义 ======

const Dolphin: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    {/* 海豚像素轮廓 - 跳跃姿态 */}
    <path d="M3 14 L5 13 L7 13 L9 12 L12 10 L15 9 L18 9 L20 10 L21 12 L20 13 L18 13 L16 14 L14 15 L12 16 L10 16 L8 15 L6 15 L4 15 Z" {...stroke} />
    <path d="M18 9 L19 7 L20 8" {...stroke} />
    <path d="M20 10 L22 9" {...stroke} />
    {/* 眼睛像素点 */}
    <rect x="15" y="11" width="1" height="1" fill="currentColor" />
    {/* 腹部线条 */}
    <path d="M6 14 L8 14 L10 14" {...stroke} strokeWidth={0.8} opacity={0.5} />
  </svg>
);

const Chip: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <rect x="6" y="6" width="12" height="12" {...stroke} />
    <rect x="9" y="9" width="6" height="6" {...stroke} />
    {/* 引脚 */}
    <path d="M9 6 L9 4 M12 6 L12 4 M15 6 L15 4" {...stroke} />
    <path d="M9 18 L9 20 M12 18 L12 20 M15 18 L15 20" {...stroke} />
    <path d="M6 9 L4 9 M6 12 L4 12 M6 15 L4 15" {...stroke} />
    <path d="M18 9 L20 9 M18 12 L20 12 M18 15 L20 15" {...stroke} />
  </svg>
);

const Usb: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M12 2 L12 20" {...stroke} />
    <path d="M12 2 L9 6 M12 2 L15 6" {...stroke} />
    <path d="M8 20 L16 20" {...stroke} />
    <rect x="9" y="8" width="6" height="8" {...stroke} />
    <circle cx="12" cy="6" r="1" fill="currentColor" />
  </svg>
);

const Battery: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <rect x="3" y="8" width="16" height="10" {...stroke} />
    <rect x="19" y="11" width="2" height="4" {...stroke} />
    {/* 电量填充 */}
    <rect x="5" y="10" width="10" height="6" fill="currentColor" opacity="0.7" />
  </svg>
);

const Sd: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M6 3 L10 3 L10 7 L14 7 L18 10 L18 21 L6 21 Z" {...stroke} />
    <path d="M9 11 L9 14 M12 11 L12 14 M15 11 L15 14" {...stroke} strokeWidth={1} opacity={0.6} />
  </svg>
);

const Wifi: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M2 9 Q12 2 22 9" {...stroke} />
    <path d="M5 13 Q12 8 19 13" {...stroke} />
    <path d="M8 17 Q12 14 16 17" {...stroke} />
    <rect x="11" y="20" width="2" height="2" fill="currentColor" />
  </svg>
);

const Radio: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="2" {...stroke} />
    <path d="M9 9 Q12 6 15 9" {...stroke} />
    <path d="M6 6 Q12 1 18 6" {...stroke} />
    <path d="M9 15 Q12 18 15 15" {...stroke} />
    <path d="M6 18 Q12 23 18 18" {...stroke} />
  </svg>
);

const Nfc: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <rect x="4" y="4" width="16" height="16" {...stroke} />
    <path d="M8 16 Q8 8 12 8 Q16 8 16 16" {...stroke} />
    <path d="M10 16 Q10 10 12 10 Q14 10 14 16" {...stroke} strokeWidth={1} opacity={0.6} />
    <circle cx="12" cy="14" r="1.5" fill="currentColor" />
  </svg>
);

const Ir: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <rect x="3" y="10" width="6" height="4" {...stroke} />
    <path d="M9 12 L13 12" {...stroke} />
    <path d="M13 8 Q17 12 13 16" {...stroke} />
    <path d="M15 6 Q21 12 15 18" {...stroke} opacity={0.6} />
  </svg>
);

const Subghz: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M4 12 L8 12" {...stroke} />
    <path d="M8 8 Q8 4 12 4 Q16 4 16 8 L16 16 Q16 20 12 20 Q8 20 8 16" {...stroke} />
    <path d="M16 12 L20 12" {...stroke} />
    <path d="M12 8 L12 16" {...stroke} strokeWidth={1} opacity={0.5} />
  </svg>
);

const Badusb: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <rect x="4" y="9" width="10" height="6" {...stroke} />
    <path d="M14 11 L20 11 L20 13 L14 13" {...stroke} />
    <path d="M7 9 L7 7 L9 7 L9 9" {...stroke} />
    {/* 警告标记 */}
    <path d="M6 15 L6 17 M6 18 L6 19" {...stroke} strokeWidth={1.2} />
  </svg>
);

const Gpio: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <rect x="5" y="5" width="14" height="14" {...stroke} />
    <circle cx="9" cy="9" r="1.2" {...stroke} />
    <circle cx="12" cy="9" r="1.2" {...stroke} />
    <circle cx="15" cy="9" r="1.2" {...stroke} />
    <circle cx="9" cy="12" r="1.2" {...stroke} />
    <circle cx="15" cy="12" r="1.2" {...stroke} />
    <circle cx="9" cy="15" r="1.2" {...stroke} />
    <circle cx="12" cy="15" r="1.2" {...stroke} />
    <circle cx="15" cy="15" r="1.2" {...stroke} />
  </svg>
);

const Terminal: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <rect x="3" y="4" width="18" height="16" {...stroke} />
    <path d="M6 9 L9 12 L6 15" {...stroke} />
    <path d="M11 15 L16 15" {...stroke} />
  </svg>
);

const Rocket: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M12 3 Q8 7 8 13 L8 16 L16 16 L16 13 Q16 7 12 3 Z" {...stroke} />
    <circle cx="12" cy="10" r="1.5" {...stroke} />
    <path d="M8 16 L6 19 M16 16 L18 19" {...stroke} />
    <path d="M10 16 L10 20 M14 16 L14 20" {...stroke} strokeWidth={1} opacity={0.6} />
  </svg>
);

const Wrench: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M15 4 Q19 4 19 8 Q19 11 16 11 L10 17 L7 20 L4 20 L4 17 L7 14 L13 8 Q13 5 15 4 Z" {...stroke} />
    <circle cx="16" cy="7" r="1" fill="currentColor" />
  </svg>
);

const Search: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <circle cx="11" cy="11" r="6" {...stroke} />
    <path d="M16 16 L20 20" {...stroke} />
  </svg>
);

const Package: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M4 8 L12 4 L20 8 L20 16 L12 20 L4 16 Z" {...stroke} />
    <path d="M4 8 L12 12 L20 8" {...stroke} />
    <path d="M12 12 L12 20" {...stroke} />
  </svg>
);

const Mirror: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <rect x="4" y="4" width="16" height="12" {...stroke} />
    <path d="M8 8 L16 8 M8 12 L13 12" {...stroke} strokeWidth={1} opacity={0.6} />
    <path d="M10 16 L10 20 M14 16 L14 20" {...stroke} />
    <path d="M7 20 L17 20" {...stroke} />
  </svg>
);

const Trophy: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M7 4 L17 4 L17 10 Q17 14 12 14 Q7 14 7 10 Z" {...stroke} />
    <path d="M7 6 L4 6 L4 9 Q4 11 7 11" {...stroke} />
    <path d="M17 6 L20 6 L20 9 Q20 11 17 11" {...stroke} />
    <path d="M12 14 L12 18 M9 20 L15 20 M10 18 L14 18" {...stroke} />
  </svg>
);

const Pet: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <ellipse cx="12" cy="14" rx="6" ry="5" {...stroke} />
    <circle cx="8" cy="8" r="1.5" {...stroke} />
    <circle cx="12" cy="6" r="1.5" {...stroke} />
    <circle cx="16" cy="8" r="1.5" {...stroke} />
    <circle cx="10" cy="13" r="0.8" fill="currentColor" />
    <circle cx="14" cy="13" r="0.8" fill="currentColor" />
  </svg>
);

const Sandwich: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M4 8 Q12 4 20 8" {...stroke} />
    <path d="M4 12 L20 12" {...stroke} />
    <path d="M4 16 L20 16" {...stroke} />
    <path d="M5 20 L19 20 Q20 20 20 19 L20 16 L4 16 L4 19 Q4 20 5 20 Z" {...stroke} />
    <circle cx="9" cy="10" r="0.6" fill="currentColor" />
    <circle cx="15" cy="10" r="0.6" fill="currentColor" />
  </svg>
);

const Translate: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M4 5 L12 5" {...stroke} />
    <path d="M8 3 L8 7" {...stroke} />
    <path d="M4 9 Q8 7 12 9" {...stroke} />
    <path d="M14 13 L20 13" {...stroke} />
    <path d="M17 11 L17 15" {...stroke} />
    <path d="M14 17 Q17 21 20 17" {...stroke} />
  </svg>
);

const Send: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M4 12 L20 4 L12 20 L10 14 Z" {...stroke} />
    <path d="M10 14 L20 4" {...stroke} strokeWidth={1} opacity={0.5} />
  </svg>
);

const Camera: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <rect x="3" y="7" width="18" height="13" {...stroke} />
    <path d="M8 7 L9 4 L15 4 L16 7" {...stroke} />
    <circle cx="12" cy="13" r="3.5" {...stroke} />
    <circle cx="12" cy="13" r="1.5" fill="currentColor" opacity="0.5" />
  </svg>
);

const Clipboard: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <rect x="5" y="5" width="14" height="16" {...stroke} />
    <rect x="9" y="3" width="6" height="3" {...stroke} />
    <path d="M8 11 L16 11 M8 14 L16 14 M8 17 L13 17" {...stroke} strokeWidth={1} opacity={0.6} />
  </svg>
);

const Help: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="9" {...stroke} />
    <path d="M9 9 Q9 6 12 6 Q15 6 15 9 Q15 11 12 12 L12 14" {...stroke} />
    <rect x="11" y="16" width="2" height="2" fill="currentColor" />
  </svg>
);

const Warning: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M12 3 L22 20 L2 20 Z" {...stroke} />
    <path d="M12 9 L12 14" {...stroke} strokeWidth={1.5} />
    <rect x="11" y="16" width="2" height="2" fill="currentColor" />
  </svg>
);

const Save: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M5 3 L19 3 L21 5 L21 21 L3 21 L3 3 Z" {...stroke} />
    <path d="M7 3 L7 10 L15 10 L15 3" {...stroke} />
    <rect x="8" y="14" width="8" height="7" {...stroke} strokeWidth={1} opacity={0.6} />
  </svg>
);

const Refresh: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M4 12 Q4 5 12 5 Q16 5 19 8" {...stroke} />
    <path d="M19 4 L19 9 L14 9" {...stroke} />
    <path d="M20 12 Q20 19 12 19 Q8 19 5 16" {...stroke} />
    <path d="M5 20 L5 15 L10 15" {...stroke} />
  </svg>
);

const Power: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M12 3 L12 11" {...stroke} />
    <path d="M7 6 Q3 10 3 14 Q3 19 12 19 Q21 19 21 14 Q21 10 17 6" {...stroke} />
  </svg>
);

const Lock: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <rect x="5" y="11" width="14" height="10" {...stroke} />
    <path d="M8 11 L8 7 Q8 3 12 3 Q16 3 16 7 L16 11" {...stroke} />
    <rect x="11" y="14" width="2" height="3" fill="currentColor" />
  </svg>
);

const Unlock: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <rect x="5" y="11" width="14" height="10" {...stroke} />
    <path d="M8 11 L8 7 Q8 3 12 3 Q15 3 15 6" {...stroke} />
    <rect x="11" y="14" width="2" height="3" fill="currentColor" />
  </svg>
);

const Check: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M4 12 L9 17 L20 6" {...stroke} />
  </svg>
);

const Cross: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M5 5 L19 19" {...stroke} />
    <path d="M19 5 L5 19" {...stroke} />
  </svg>
);

const ChevronRight: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M9 5 L16 12 L9 19" {...stroke} />
  </svg>
);

const ChevronDown: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M5 9 L12 16 L19 9" {...stroke} />
  </svg>
);

const Dot: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="4" fill="currentColor" />
  </svg>
);

const Shield: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M12 3 L20 6 L20 12 Q20 18 12 21 Q4 18 4 12 L4 6 Z" {...stroke} />
    <path d="M9 12 L11 14 L15 10" {...stroke} />
  </svg>
);

const Brain: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M9 4 Q5 4 5 8 Q3 9 3 12 Q3 15 5 16 Q5 20 9 20" {...stroke} />
    <path d="M15 4 Q19 4 19 8 Q21 9 21 12 Q21 15 19 16 Q19 20 15 20" {...stroke} />
    <path d="M9 4 Q12 4 12 8 L12 16 Q12 20 15 20" {...stroke} opacity={0.6} />
    <path d="M15 4 Q12 4 12 8" {...stroke} opacity={0.6} />
    <circle cx="9" cy="9" r="0.8" fill="currentColor" />
    <circle cx="15" cy="9" r="0.8" fill="currentColor" />
    <circle cx="9" cy="15" r="0.8" fill="currentColor" />
    <circle cx="15" cy="15" r="0.8" fill="currentColor" />
  </svg>
);

const Settings: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="3" {...stroke} />
    <path d="M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12 M5 5 L7 7 M17 17 L19 19 M19 5 L17 7 M5 19 L7 17" {...stroke} />
  </svg>
);

const Folder: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M3 6 L10 6 L12 8 L21 8 L21 19 L3 19 Z" {...stroke} />
  </svg>
);

const Download: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M12 3 L12 15" {...stroke} />
    <path d="M7 11 L12 16 L17 11" {...stroke} />
    <path d="M4 19 L20 19" {...stroke} />
  </svg>
);

const Play: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M6 4 L20 12 L6 20 Z" {...stroke} />
  </svg>
);

const Book: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M4 4 L12 6 L20 4 L20 20 L12 18 L4 20 Z" {...stroke} />
    <path d="M12 6 L12 18" {...stroke} strokeWidth={1} opacity={0.5} />
  </svg>
);

const Key: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <circle cx="8" cy="8" r="4" {...stroke} />
    <path d="M11 11 L20 20" {...stroke} />
    <path d="M17 17 L19 15 M15 15 L17 13" {...stroke} strokeWidth={1} opacity={0.6} />
  </svg>
);

const Card: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <rect x="3" y="5" width="18" height="14" {...stroke} />
    <path d="M3 9 L21 9" {...stroke} />
    <path d="M6 14 L10 14" {...stroke} strokeWidth={1} opacity={0.6} />
    <rect x="15" y="13" width="3" height="2" fill="currentColor" opacity="0.5" />
  </svg>
);

const Tv: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <rect x="3" y="6" width="18" height="13" {...stroke} />
    <path d="M8 3 L12 6 L16 3" {...stroke} />
    <path d="M6 16 L18 16" {...stroke} strokeWidth={1} opacity={0.5} />
  </svg>
);

const Antenna: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <path d="M12 12 L12 20" {...stroke} />
    <path d="M8 8 L12 12 L16 8" {...stroke} />
    <path d="M5 5 L8 8 M16 8 L19 5" {...stroke} />
    <circle cx="12" cy="11" r="1.5" {...stroke} />
    <path d="M9 20 L15 20" {...stroke} />
  </svg>
);

const Circuit: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <rect x="6" y="6" width="12" height="12" {...stroke} />
    <path d="M6 9 L2 9 M6 15 L2 15 M18 9 L22 9 M18 15 L22 15" {...stroke} />
    <path d="M9 6 L9 2 M15 6 L15 2 M9 18 L9 22 M15 18 L15 22" {...stroke} />
    <circle cx="9" cy="9" r="0.8" fill="currentColor" />
    <circle cx="15" cy="15" r="0.8" fill="currentColor" />
    <path d="M9 9 L15 15" {...stroke} strokeWidth={0.8} opacity={0.5} />
  </svg>
);

const Bug: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...base(size, className)}>
    <ellipse cx="12" cy="13" rx="4" ry="5" {...stroke} />
    <path d="M12 8 L12 18" {...stroke} strokeWidth={1} opacity={0.5} />
    <path d="M8 7 L6 5 M16 7 L18 5" {...stroke} />
    <path d="M8 11 L4 11 M8 15 L4 15 M16 11 L20 11 M16 15 L20 15" {...stroke} />
    <circle cx="10" cy="6" r="0.6" fill="currentColor" />
    <circle cx="14" cy="6" r="0.6" fill="currentColor" />
  </svg>
);

// ====== 图标映射表 ======

const ICONS: Record<IconName, React.FC<IconProps>> = {
  dolphin: Dolphin,
  chip: Chip,
  usb: Usb,
  battery: Battery,
  sd: Sd,
  wifi: Wifi,
  radio: Radio,
  nfc: Nfc,
  ir: Ir,
  subghz: Subghz,
  badusb: Badusb,
  gpio: Gpio,
  terminal: Terminal,
  rocket: Rocket,
  wrench: Wrench,
  search: Search,
  package: Package,
  mirror: Mirror,
  trophy: Trophy,
  pet: Pet,
  sandwich: Sandwich,
  translate: Translate,
  send: Send,
  camera: Camera,
  clipboard: Clipboard,
  help: Help,
  warning: Warning,
  save: Save,
  refresh: Refresh,
  power: Power,
  lock: Lock,
  unlock: Unlock,
  check: Check,
  cross: Cross,
  "chevron-right": ChevronRight,
  "chevron-down": ChevronDown,
  dot: Dot,
  shield: Shield,
  brain: Brain,
  settings: Settings,
  folder: Folder,
  download: Download,
  play: Play,
  book: Book,
  key: Key,
  card: Card,
  tv: Tv,
  antenna: Antenna,
  circuit: Circuit,
  bug: Bug,
};

interface IconComponentProps extends IconProps {
  name: IconName;
}

/**
 * 统一图标组件
 * @example <Icon name="dolphin" size={24} />
 */
export const Icon: React.FC<IconComponentProps> = ({ name, size = 24, className, strokeWidth, style }) => {
  const SvgComponent = ICONS[name];
  if (!SvgComponent) {
    console.warn(`Icon "${name}" not found`);
    return null;
  }
  if (style) {
    return (
      <span style={{ display: "inline-flex", ...style }}>
        <SvgComponent size={size} className={className} strokeWidth={strokeWidth} />
      </span>
    );
  }
  return <SvgComponent size={size} className={className} strokeWidth={strokeWidth} />;
};

export default Icon;
