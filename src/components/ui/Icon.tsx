/** 像素风 SVG 图标组件 */
import React from "react";
import type { IconName } from "@/types";

const ICON_PATHS: Record<string, string> = {
  chip: "M6 3h12v2H6zM6 19h12v2H6zM4 7h2v10H4zM18 7h2v10h-2zM8 8h8v8H8z",
  nfc: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 100 12 6 6 0 000-12zm0 2a4 4 0 110 8 4 4 0 010-8z",
  radio: "M12 4a8 8 0 00-8 8h2a6 6 0 016-6V4zm0 4a4 4 0 00-4 4h2a2 2 0 012-2V8zm0 4a2 2 0 100 4 2 2 0 000-4zM4 14h2v6H4zM18 14h2v6h-2zM8 16h8v4H8z",
  ir: "M3 12h4l2-6h6l2 6h4M7 12v8h10v-8M10 16h4",
  keyboard: "M3 6h18v12H3zM6 9h2v2H6zM10 9h2v2h-2zM14 9h2v2h-2zM6 13h12v2H6z",
  circuit: "M6 6h4v4H6zM14 6h4v4h-4zM6 14h4v4H6zM14 14h4v4h-4zM10 8h4M8 10v4M16 10v4M10 16h4",
  robot: "M8 4h8v4H8zM6 8h12v10H6zM9 12h2v2H9zM13 12h2v2h-2zM9 16h6M10 2h2v2h-2zM14 2h2v2h-2z",
  rocket: "M12 2c4 4 6 8 6 12l-2 4H8l-2-4c0-4 2-8 6-12zM9 18h6l-1 4h-4zM10 10a2 2 0 104 0 2 2 0 10-4 0z",
  wrench: "M14 7a4 4 0 11-5 5L4 17v3h3l5-5a4 4 0 005-5l-3 3-2-2 2-3z",
  mirror: "M4 4h7v16H4zM13 4h7v16h-7zM8 8l-2 4h4zM16 8l-2 4h4z",
  trophy: "M6 3h12v2h2v4a4 4 0 01-4 4h-1a5 5 0 01-4 2 5 5 0 01-4-2H6a4 4 0 01-4-4V5h2zM6 5H4v2a2 2 0 002 2zM18 5h2v2a2 2 0 01-2 2zM10 15h4l1 4h-6z",
  pet: "M8 6c0-2 2-4 4-4s4 2 4 4v2c0 4-2 8-4 8s-4-4-4-8M9 8a1 1 0 11-2 0 1 1 0 012 0M17 8a1 1 0 11-2 0 1 1 0 012 0M10 12s1 1 2 1 2-1 2-1",
  settings: "M12 8a4 4 0 100 8 4 4 0 000-8zm0 2a2 2 0 110 4 2 2 0 010-4zM12 2l1 3-2 0zM12 19l1 3-2 0zM2 12l3 1v-2zM19 12l3 1v-2zM5 5l2 2zM17 17l2 2zM19 5l-2 2zM7 17l-2 2",
  help: "M12 4a8 8 0 100 16 8 8 0 000-16zm0 3a3 3 0 013 3c0 2-3 2-3 4M12 17h.01",
  about: "M12 4a8 8 0 100 16 8 8 0 000-16zm0 4h.01M11 11h2v6h-2z",
  dashboard: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
  package: "M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10",
  warning: "M12 3l10 18H2zM12 10v6M12 18h.01",
  check: "M5 12l5 5L20 7",
  cross: "M6 6l12 12M18 6L6 18",
  "chevron-down": "M6 9l6 6 6-6",
  "chevron-up": "M6 15l6-6 6 6",
  "chevron-left": "M15 6l-6 6 6 6",
  "chevron-right": "M9 6l6 6-6 6",
  battery: "M4 8h14v8H4zM18 10h2v4h-2zM7 10h2v4H7z",
  signal: "M4 18v-3M8 18v-6M12 18v-9M16 18v-12M20 18V3",
  heart: "M12 21l-9-9a5 5 0 010-7 5 5 0 017 0l2 2 2-2a5 5 0 017 0 5 5 0 010 7z",
  star: "M12 3l3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1z",
  sandwich: "M4 8h16M4 12h16M4 16h16",
  book: "M4 4h7a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8z",
  terminal: "M4 5h16v14H4zM7 9l3 3-3 3M13 15h4",
  shield: "M12 2l8 4v6c0 5-4 8-8 10-4-2-8-5-8-10V6z",
  download: "M12 3v10M8 11l4 4 4-4M4 17h16v4H4z",
  upload: "M12 17V7M8 9l4-4 4 4M4 3h16v4H4z",
  play: "M6 4l12 8-12 8z",
  pause: "M6 4h4v16H6zM14 4h4v16h-4z",
  stop: "M6 6h12v12H6z",
  refresh: "M4 12a8 8 0 018-8 8 8 0 016 3M20 4v4h-4M20 12a8 8 0 01-8 8 8 8 0 01-6-3M4 20v-4h4",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zm0 3a4 4 0 110 8 4 4 0 010-8zM16 16l4 4",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  plus: "M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z",
  minus: "M4 12h16v2H4z",
  info: "M12 4a8 8 0 100 16 8 8 0 000-16zm0 4h.01M11 11h2v6h-2z",
  lock: "M6 10V7a6 6 0 0112 0v3M4 10h16v10H4z",
  unlock: "M6 10V7a6 6 0 0110-4M4 10h16v10H4z",
  power: "M12 3v8M7 6a8 8 0 1010 0",
  bolt: "M13 2L4 14h6l-2 8 9-12h-6z",
  fire: "M12 2c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4-1 2 1 3 3 3 0-3-2-4 0-9z",
  edit: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
  flask: "M9 2v6L4 20a1 1 0 001 1h14a1 1 0 001-1L15 8V2M8 2h8M7 14h10",
  graduation: "M12 3L2 9l10 6 10-6-10-6zM6 11v5c0 1 3 3 6 3s6-2 6-3v-5M22 9v6",
  history: "M12 8v5l3 3M3 12a9 9 0 109-9 9 9 0 00-7 3M3 3v3h3M12 3a9 9 0 11-9 9",
  cloud: "M6 18a4 4 0 010-8 5 5 0 019-2 3 3 0 011 6H6z",
  alert: "M12 3l10 18H2zM12 10v6M12 18h.01",
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  fill?: string;
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 16,
  className = "",
  style,
  fill = "currentColor",
}) => {
  const path = ICON_PATHS[name] || ICON_PATHS["info"];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={fill}
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      style={{ shapeRendering: "crispEdges", flexShrink: 0, ...style }}
    >
      <path d={path} />
    </svg>
  );
};
