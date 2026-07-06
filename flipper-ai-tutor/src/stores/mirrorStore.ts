/**
 * 屏幕镜像状态管理 Store
 *
 * 管理 Flipper Zero 屏幕镜像的启停、当前帧、按键发送、菜单光标。
 * 自动监听 screen-mirror-frame 事件并更新当前帧。
 *
 * 在浏览器（非 Tauri）环境下，内置一套像素动画引擎：
 *   - 5x7 像素字体渲染器（drawText / drawRect / drawProgressBar）
 *   - generateDemoFrames() 生成 128x64 的动态画面序列，
 *     模拟真实 Flipper 屏幕的"开机 -> 主菜单 -> NFC 子菜单 -> 读卡"浏览体验
 *   - playDemoAnimation() 每 100ms 推送下一帧，循环播放
 *
 * 兼容别名：start / stop / cursor / moveCursor
 * 供 App.tsx 中的 MirrorModalContent 直接使用。
 */
import { create } from "zustand";
import type { ScreenMirrorFrame } from "@/types";
import {
  isTauri,
  startMirror,
  stopMirror,
  sendMirrorKey,
  onScreenMirrorFrame,
} from "@/lib/tauri";

// ================================================================
// 常量
// ================================================================

/** Flipper Zero 屏幕分辨率（宽） */
const SCREEN_WIDTH = 128;
/** Flipper Zero 屏幕分辨率（高） */
const SCREEN_HEIGHT = 64;

/** Flipper Zero 主菜单项（用于镜像弹窗中的模拟菜单） */
export const MIRROR_MENU: readonly string[] = [
  "Sub-GHz",
  "125kHz RFID",
  "NFC",
  "Infrared",
  "iButton",
  "Bad USB",
  "U2F",
  "Apps",
] as const;

// ================================================================
// 5x7 像素字体
// 每个字符用 7 行表示，每行 5 位（bit4=最左列，bit0=最右列）
// 1 表示该像素点亮，0 表示熄灭
// ================================================================

const FONT_5x7: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  "3": [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  " ": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
  ":": [0b00000, 0b00100, 0b00100, 0b00000, 0b00100, 0b00100, 0b00000],
  ".": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b01100, 0b01100],
  "-": [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  "/": [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  "%": [0b11001, 0b11010, 0b00100, 0b00100, 0b00100, 0b01011, 0b10011],
  "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100],
  "?": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b00000, 0b00100],
  "(": [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ")": [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  "'": [0b00100, 0b00100, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
  ",": [0b00000, 0b00000, 0b00000, 0b00000, 0b01100, 0b01100, 0b00100],
  ">": [0b00000, 0b10000, 0b01000, 0b00100, 0b01000, 0b10000, 0b00000],
  "<": [0b00000, 0b00010, 0b00100, 0b01000, 0b00100, 0b00010, 0b00000],
  "+": [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000],
  "=": [0b00000, 0b00000, 0b11111, 0b00000, 0b11111, 0b00000, 0b00000],
  "*": [0b00000, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0b00000],
  "#": [0b01010, 0b11111, 0b01010, 0b01010, 0b11111, 0b01010, 0b00000],
};

// ================================================================
// 像素画布绘制工具
// canvas 为 number[]，长度 = SCREEN_WIDTH * SCREEN_HEIGHT
// 索引 = y * SCREEN_WIDTH + x，值 1=亮 0=灭
// ================================================================

/** 创建全黑画布 */
function createBlankCanvas(): number[] {
  return new Array(SCREEN_WIDTH * SCREEN_HEIGHT).fill(0);
}

/** 将画布封装为 ScreenMirrorFrame */
function makeFrame(canvas: number[]): ScreenMirrorFrame {
  return { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, data: canvas };
}

/** 设置单个像素（自动裁剪越界） */
function setPixel(canvas: number[], x: number, y: number, on: number): void {
  if (x < 0 || x >= SCREEN_WIDTH || y < 0 || y >= SCREEN_HEIGHT) return;
  canvas[y * SCREEN_WIDTH + x] = on;
}

/** 绘制水平线 */
function drawHLine(canvas: number[], x: number, y: number, w: number): void {
  for (let i = 0; i < w; i++) setPixel(canvas, x + i, y, 1);
}

/** 绘制垂直线 */
function drawVLine(canvas: number[], x: number, y: number, h: number): void {
  for (let j = 0; j < h; j++) setPixel(canvas, x, y + j, 1);
}

/** 绘制实心矩形 */
function fillRect(canvas: number[], x: number, y: number, w: number, h: number): void {
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) setPixel(canvas, x + i, y + j, 1);
  }
}

/**
 * 绘制矩形边框
 * @param x 左上角 x
 * @param y 左上角 y
 * @param w 宽度
 * @param h 高度
 */
function drawRect(canvas: number[], x: number, y: number, w: number, h: number): void {
  drawHLine(canvas, x, y, w);            // 上边
  drawHLine(canvas, x, y + h - 1, w);    // 下边
  drawVLine(canvas, x, y, h);            // 左边
  drawVLine(canvas, x + w - 1, y, h);    // 右边
}

/**
 * 在指定位置绘制文字（5x7 像素字体）
 * 文字统一转大写后查表，未命中的字符用空格替代。
 * @param x 起始 x（左上角）
 * @param y 起始 y（左上角）
 * @param text 待绘制文本
 * @param inverse 是否反色（背景填充亮、字模像素灭），用于菜单高亮
 */
function drawText(
  canvas: number[],
  x: number,
  y: number,
  text: string,
  inverse: boolean = false
): void {
  const upper = text.toUpperCase();
  let curX = x;
  for (const ch of upper) {
    const glyph = FONT_5x7[ch] ?? FONT_5x7[" "];
    if (inverse) {
      // 反色：先填充 5x7 字符块为亮，再清除字模像素形成"挖空"效果
      fillRect(canvas, curX, y, 5, 7);
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row];
        for (let col = 0; col < 5; col++) {
          if (bits & (1 << (4 - col))) {
            setPixel(canvas, curX + col, y + row, 0);
          }
        }
      }
    } else {
      // 正常：点亮字模像素
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row];
        for (let col = 0; col < 5; col++) {
          if (bits & (1 << (4 - col))) {
            setPixel(canvas, curX + col, y + row, 1);
          }
        }
      }
    }
    curX += 6; // 5px 字符 + 1px 间距
  }
}

/**
 * 绘制进度条（带边框 + 填充）
 * @param x 左上角 x
 * @param y 左上角 y
 * @param w 进度条总宽度（含边框）
 * @param progress 进度 0..1
 */
function drawProgressBar(
  canvas: number[],
  x: number,
  y: number,
  w: number,
  progress: number
): void {
  const p = Math.max(0, Math.min(1, progress));
  const barH = 7;
  // 外边框
  drawRect(canvas, x, y, w, barH);
  // 内部填充宽度
  const innerW = Math.max(0, w - 2);
  const filled = Math.round(p * innerW);
  for (let i = 0; i < filled; i++) {
    for (let j = 1; j < barH - 1; j++) {
      setPixel(canvas, x + 1 + i, y + j, 1);
    }
  }
}

// ================================================================
// Demo 动画帧序列生成
// 生成 70 帧动态画面，模拟 Flipper 屏幕的真实浏览体验：
//   帧  1-10：开机画面（Momentum logo 逐行显示）
//   帧 11-30：主菜单（光标高亮逐项移动）
//   帧 31-50：进入 NFC 子菜单（Read / Saved / Extra Actions）
//   帧 51-70：读取卡片动画（Reading... + 进度条）
// 播放时循环复用
// ================================================================

/** 生成完整的 Demo 帧序列（惰性缓存） */
function generateDemoFrames(): ScreenMirrorFrame[] {
  const frames: ScreenMirrorFrame[] = [];

  // -------- 场景一：开机画面（帧 1-10） --------
  // "MOMENTUM" logo 逐行显示，最后呈现 READY
  const bootLines = ["MOMENTUM", "FIRMWARE", "V 0.1.3"];
  for (let i = 0; i < 10; i++) {
    const canvas = createBlankCanvas();
    drawRect(canvas, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    drawText(canvas, 4, 3, "BOOT");
    drawHLine(canvas, 1, 12, 126);
    // 每 3 帧多显示一行
    const linesToShow = Math.min(bootLines.length, Math.floor(i / 3) + 1);
    for (let li = 0; li < linesToShow; li++) {
      const text = bootLines[li];
      const textW = text.length * 6 - 1;
      const startX = Math.floor((SCREEN_WIDTH - textW) / 2);
      drawText(canvas, startX, 20 + li * 12, text);
    }
    // 最后阶段显示 READY 与闪烁光标
    if (i >= 8) {
      drawText(canvas, 50, 54, "READY");
    } else if (i % 2 === 0) {
      setPixel(canvas, 60, 54, 1);
    }
    frames.push(makeFrame(canvas));
  }

  // -------- 场景二：主菜单（帧 11-30） --------
  // 6 个菜单项，光标高亮逐项向下移动后循环
  const menuItems = ["SUB-GHZ", "RFID 125K", "NFC", "INFRARED", "BAD USB", "APPS"];
  for (let i = 0; i < 20; i++) {
    const canvas = createBlankCanvas();
    drawRect(canvas, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    drawText(canvas, 4, 3, "MAIN MENU");
    drawHLine(canvas, 1, 12, 126);
    const cursor = Math.floor(i / 3) % menuItems.length;
    for (let mi = 0; mi < menuItems.length; mi++) {
      const yPos = 14 + mi * 8;
      if (mi === cursor) {
        // 高亮整行：先填充背景，再以反色绘制文字
        fillRect(canvas, 1, yPos - 1, 126, 8);
        drawText(canvas, 4, yPos, menuItems[mi], true);
      } else {
        drawText(canvas, 4, yPos, menuItems[mi]);
      }
    }
    // 底部状态栏
    drawHLine(canvas, 1, 62, 126);
    drawText(canvas, 4, 56, "MOMENTUM FW");
    frames.push(makeFrame(canvas));
  }

  // -------- 场景三：NFC 子菜单（帧 31-50） --------
  // 进入 NFC 功能，展示 Read / Saved / Extra Actions，光标移动
  const subItems = ["READ", "SAVED", "EXTRA ACTIONS"];
  for (let i = 0; i < 20; i++) {
    const canvas = createBlankCanvas();
    drawRect(canvas, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    drawText(canvas, 4, 3, "NFC");
    drawHLine(canvas, 1, 12, 126);
    const cursor = Math.floor(i / 5) % subItems.length;
    for (let si = 0; si < subItems.length; si++) {
      const yPos = 18 + si * 12;
      if (si === cursor) {
        fillRect(canvas, 1, yPos - 1, 126, 9);
        drawText(canvas, 6, yPos, subItems[si], true);
      } else {
        drawText(canvas, 6, yPos, subItems[si]);
      }
    }
    drawHLine(canvas, 1, 62, 126);
    drawText(canvas, 4, 56, "BACK");
    frames.push(makeFrame(canvas));
  }

  // -------- 场景四：读取卡片动画（帧 51-70） --------
  // "READING..." + 进度条递增 + 百分比，模拟 NFC 读卡过程
  for (let i = 0; i < 20; i++) {
    const canvas = createBlankCanvas();
    drawRect(canvas, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    drawText(canvas, 4, 3, "NFC > READ");
    drawHLine(canvas, 1, 12, 126);
    // 读取中提示
    drawText(canvas, 4, 20, "READING...");
    // 闪烁的卡片轮廓（每隔一帧显示，营造"检测到卡片"的视觉反馈）
    if (i % 2 === 0) {
      drawRect(canvas, 88, 18, 36, 22);
      drawText(canvas, 96, 26, "CARD");
    }
    // 进度条（0% -> 100%）
    const progress = (i + 1) / 20;
    drawProgressBar(canvas, 8, 38, 112, progress);
    // 百分比文本
    const pct = Math.round(progress * 100);
    const pctText = `${pct}%`;
    const pctW = pctText.length * 6 - 1;
    drawText(canvas, Math.floor((SCREEN_WIDTH - pctW) / 2), 50, pctText);
    // 完成提示
    if (i >= 18) {
      drawText(canvas, 40, 56, "DONE");
    }
    frames.push(makeFrame(canvas));
  }

  return frames;
}

// ================================================================
// Demo 帧缓存与定时器（模块级）
// ================================================================

/** Demo 帧序列缓存（首次使用时惰性生成） */
let _demoFramesCache: ScreenMirrorFrame[] | null = null;

/** 获取 Demo 帧序列（带缓存） */
function getDemoFrames(): ScreenMirrorFrame[] {
  if (!_demoFramesCache) {
    _demoFramesCache = generateDemoFrames();
  }
  return _demoFramesCache;
}

/** Demo 动画定时器句柄 */
let _demoTimer: ReturnType<typeof setInterval> | null = null;

// ================================================================
// 类型定义
// ================================================================

/** 屏幕镜像 Store 状态 */
interface MirrorStore {
  // ---- State（规范 API） ----
  /** 是否正在镜像 */
  isMirroring: boolean;
  /** 当前镜像帧 */
  currentFrame: ScreenMirrorFrame | null;
  /** 帧率（fps） */
  fps: number;
  /** 最近一次错误信息 */
  lastError: string | null;
  /** 当前 Demo 动画帧索引（自动递增，循环播放） */
  frameIndex: number;

  // ---- State（组件兼容） ----
  /** 菜单光标位置（当前选中项索引） */
  cursor: number;

  // ---- Actions（规范 API） ----
  /** 开始屏幕镜像 */
  startMirror: () => Promise<void>;
  /** 停止屏幕镜像 */
  stopMirror: () => Promise<void>;
  /** 发送按键到设备 */
  sendKey: (key: string) => Promise<void>;
  /** 初始化事件监听，返回取消监听函数 */
  initListeners: () => Promise<() => void>;
  /** 播放 Demo 屏幕镜像动画（浏览器环境，每 100ms 推送下一帧） */
  playDemoAnimation: () => void;

  // ---- Actions（组件兼容别名） ----
  /** startMirror 别名（fire-and-forget） */
  start: () => void;
  /** stopMirror 别名（fire-and-forget） */
  stop: () => void;
  /** 移动菜单光标（-1 上移，+1 下移，循环） */
  moveCursor: (delta: number) => void;
}

// ================================================================
// Store 创建
// ================================================================

export const useMirrorStore = create<MirrorStore>((set, get) => ({
  // ---- State 初始值 ----
  isMirroring: false,
  currentFrame: null,
  fps: 0,
  lastError: null,
  frameIndex: 0,
  cursor: 0,

  // ---- Actions（规范 API） ----

  startMirror: async () => {
    const { isMirroring } = get();
    if (isMirroring) return;

    set({ lastError: null });
    startFpsTimer();

    // 非 Tauri 环境（浏览器）：播放内置 Demo 像素动画
    if (!isTauri()) {
      get().playDemoAnimation();
      return;
    }

    // Tauri 环境：调用真实后端启动镜像（原有逻辑保持不变）
    try {
      const result = await startMirror();
      if (result.success) {
        set({ isMirroring: true });
      } else {
        set({ lastError: result.error ?? "启动镜像失败" });
      }
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
    }
  },

  stopMirror: async () => {
    set({ lastError: null });
    stopFpsTimer();

    // 停止 Demo 动画定时器（浏览器环境）
    if (_demoTimer) {
      clearInterval(_demoTimer);
      _demoTimer = null;
    }

    // 非 Tauri 环境：直接重置状态
    if (!isTauri()) {
      set({ isMirroring: false, currentFrame: null, fps: 0 });
      return;
    }

    // Tauri 环境：调用真实后端停止镜像（原有逻辑保持不变）
    try {
      const result = await stopMirror();
      if (result.success) {
        set({ isMirroring: false, currentFrame: null, fps: 0 });
      } else {
        set({ lastError: result.error ?? "停止镜像失败" });
      }
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
    }
  },

  sendKey: async (key) => {
    set({ lastError: null });

    // 非 Tauri 环境：Demo 模式下推进动画帧，模拟按键响应
    if (!isTauri()) {
      const frames = getDemoFrames();
      if (frames.length > 0) {
        const nextIdx = useMirrorStore.getState().frameIndex % frames.length;
        useMirrorStore.setState({
          currentFrame: frames[nextIdx],
          frameIndex: nextIdx + 1,
        });
      }
      return;
    }

    // Tauri 环境：发送真实按键到设备
    try {
      const result = await sendMirrorKey(key);
      if (!result.success) {
        set({ lastError: result.error ?? "发送按键失败" });
      }
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
    }
  },

  initListeners: async () => {
    // 已由模块级自动注册监听，此方法保留为空操作以兼容旧调用
    return () => {};
  },

  /**
   * 播放 Demo 屏幕镜像动画。
   * 启动定时器，每 100ms 推送下一帧，循环播放已生成的帧序列。
   */
  playDemoAnimation: () => {
    // 已在播放则跳过
    if (_demoTimer) return;

    const frames = getDemoFrames();
    set({ isMirroring: true, lastError: null });

    // 立即推送第一帧
    const firstIdx = useMirrorStore.getState().frameIndex % frames.length;
    useMirrorStore.setState({
      currentFrame: frames[firstIdx],
      frameIndex: firstIdx + 1,
    });
    _mirrorFrameCount++;

    // 定时推送后续帧（约 10fps）
    _demoTimer = setInterval(() => {
      const idx = useMirrorStore.getState().frameIndex % frames.length;
      useMirrorStore.setState({
        currentFrame: frames[idx],
        frameIndex: idx + 1,
      });
      _mirrorFrameCount++;
    }, 100);
  },

  // ---- Actions（组件兼容别名） ----

  start: () => {
    void get().startMirror();
  },

  stop: () => {
    void get().stopMirror();
  },

  moveCursor: (delta: number) => {
    set((state) => {
      const len = MIRROR_MENU.length;
      const next = (state.cursor + delta + len) % len;
      return { cursor: next };
    });
  },
}));

// ================================================================
// 模块级别自动注册事件监听
// ================================================================

let _mirrorUnlisten: (() => void) | null = null;
let _mirrorFrameCount = 0;
let _mirrorFpsTimer: ReturnType<typeof setInterval> | null = null;

/** 启动 FPS 计算定时器（仅在镜像运行时） */
function startFpsTimer() {
  if (_mirrorFpsTimer) return;
  _mirrorFpsTimer = setInterval(() => {
    if (_mirrorFrameCount > 0) {
      useMirrorStore.setState({ fps: _mirrorFrameCount });
      _mirrorFrameCount = 0;
    }
  }, 1000);
}

/** 停止 FPS 计算定时器 */
function stopFpsTimer() {
  if (_mirrorFpsTimer) {
    clearInterval(_mirrorFpsTimer);
    _mirrorFpsTimer = null;
  }
  _mirrorFrameCount = 0;
}

onScreenMirrorFrame((frame) => {
  _mirrorFrameCount++;
  useMirrorStore.setState({ currentFrame: frame });
}).then((fn) => {
  _mirrorUnlisten = fn;
});

/** 清理屏幕镜像事件监听（用于 HMR 热更新或测试） */
export function cleanupMirrorListeners(): void {
  _mirrorUnlisten?.();
  _mirrorUnlisten = null;
  if (_mirrorFpsTimer) {
    clearInterval(_mirrorFpsTimer);
    _mirrorFpsTimer = null;
  }
  if (_demoTimer) {
    clearInterval(_demoTimer);
    _demoTimer = null;
  }
}
