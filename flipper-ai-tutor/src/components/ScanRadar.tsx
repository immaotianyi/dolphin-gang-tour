/**
 * ScanRadar — USB 设备扫描雷达组件
 * 圆形雷达扫描动画，用于设备连接界面的视觉展示：
 *   - 黑色圆形区域 + 橙色边框
 *   - 中心发射的扫描线（360 度旋转，conic 渐变扇形 + 锐利前沿）
 *   - 同心圆波纹 + 十字准线
 *   - 检测到设备时：目标位置出现脉冲点 + "FLIPPER ZERO FOUND" 标签
 *   - 底部状态文字："SCANNING USB PORTS..." -> "DEVICE DETECTED!"
 *
 * 纯 CSS + SVG 实现，不使用图片；所有图标用 <Icon />，无 emoji。
 */
import React from "react";
import { Icon } from "@/components/Icon";
import "@/styles/animations.css";

interface ScanRadarProps {
  /** 是否正在扫描 */
  isScanning: boolean;
  /** 是否已检测到设备 */
  deviceFound: boolean;
  /** 雷达直径（px），默认 200 */
  size?: number;
}

/** 同心圆半径占比（相对雷达半径） */
const RING_FACTORS = [0.33, 0.66, 1] as const;
/** 目标点方位（度，0 = 正上方，顺时针为正） */
const TARGET_ANGLE_DEG = 45;
/** 目标点距圆心的距离占比（相对雷达半径） */
const TARGET_RADIUS_FACTOR = 0.62;

export const ScanRadar: React.FC<ScanRadarProps> = ({
  isScanning,
  deviceFound,
  size = 200,
}) => {
  const radius = size / 2;

  // 计算目标点在雷达内的坐标（圆心为原点）
  const targetRadius = radius * TARGET_RADIUS_FACTOR;
  const targetRad = (TARGET_ANGLE_DEG * Math.PI) / 180;
  const targetX = radius + targetRadius * Math.sin(targetRad);
  const targetY = radius - targetRadius * Math.cos(targetRad);

  // 扫描扇形在「扫描中」或「已发现」时持续旋转，保持画面活力
  const sweepActive = isScanning || deviceFound;

  // 底部状态文案与配色
  const statusText = deviceFound
    ? "DEVICE DETECTED!"
    : isScanning
      ? "SCANNING USB PORTS..."
      : "RADAR STANDBY";
  const statusColor = deviceFound
    ? "var(--c-green)"
    : isScanning
      ? "var(--c-orange)"
      : "#888";
  const statusIcon = deviceFound ? "check" : isScanning ? "search" : "antenna";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
      }}
    >
      {/* ===== 雷达本体 ===== */}
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at center, rgba(255,123,36,0.10) 0%, var(--c-black) 70%)",
          border: "2px solid var(--c-orange)",
          boxShadow:
            "0 0 16px rgba(255,123,36,0.4), inset 0 0 24px rgba(0,0,0,0.85)",
          overflow: "hidden",
        }}
      >
        {/* 同心圆波纹 */}
        {RING_FACTORS.map((f, i) => (
          <div
            key={i}
            aria-hidden
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: size * f,
              height: size * f,
              marginLeft: -(size * f) / 2,
              marginTop: -(size * f) / 2,
              borderRadius: "50%",
              border: "1px solid rgba(255,123,36,0.25)",
              pointerEvents: "none",
            }}
          />
        ))}

        {/* 十字准线（SVG） */}
        <svg
          aria-hidden
          width={size}
          height={size}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <line
            x1={0}
            y1={radius}
            x2={size}
            y2={radius}
            stroke="rgba(255,123,36,0.2)"
            strokeWidth={1}
          />
          <line
            x1={radius}
            y1={0}
            x2={radius}
            y2={size}
            stroke="rgba(255,123,36,0.2)"
            strokeWidth={1}
          />
        </svg>

        {/* 扫描扇形 + 锐利前沿线（旋转） */}
        {sweepActive && (
          <div
            className="anim-radar"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background:
                "conic-gradient(from 0deg, rgba(255,123,36,0.55) 0deg, rgba(255,123,36,0.18) 28deg, rgba(255,123,36,0) 60deg, rgba(255,123,36,0) 360deg)",
              pointerEvents: "none",
            }}
          >
            {/* 锐利前沿线（12 点方向，从圆心到边缘） */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 3,
                left: "50%",
                width: 2,
                height: radius - 3,
                marginLeft: -1,
                background: "var(--c-orange)",
                boxShadow: "0 0 8px var(--c-orange)",
              }}
            />
          </div>
        )}

        {/* 中心点 */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 8,
            height: 8,
            marginLeft: -4,
            marginTop: -4,
            borderRadius: "50%",
            background: deviceFound ? "var(--c-green)" : "var(--c-orange)",
            boxShadow: `0 0 10px ${deviceFound ? "var(--c-green)" : "var(--c-orange)"}`,
          }}
        />

        {/* 设备目标点（检测到时） */}
        {deviceFound && (
          <>
            {/* 脉冲扩散圆环 */}
            <div
              className="anim-pulse-ring"
              aria-hidden
              style={{
                position: "absolute",
                top: targetY,
                left: targetX,
                width: 24,
                height: 24,
                marginLeft: -12,
                marginTop: -12,
                borderRadius: "50%",
                border: "2px solid var(--c-green)",
                pointerEvents: "none",
              }}
            />
            {/* 目标核心点 */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: targetY,
                left: targetX,
                width: 10,
                height: 10,
                marginLeft: -5,
                marginTop: -5,
                borderRadius: "50%",
                background: "var(--c-green)",
                boxShadow: "0 0 12px var(--c-green)",
              }}
            />
          </>
        )}
      </div>

      {/* ===== 目标标签（检测到时） ===== */}
      {deviceFound && (
        <div
          className="font-pixel anim-fade-in-up"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 10px",
            border: "2px solid var(--c-green)",
            background: "var(--c-dark2)",
            color: "var(--c-green)",
            fontSize: 9,
            letterSpacing: 1,
            boxShadow: "3px 3px 0 rgba(0,255,65,0.3)",
          }}
        >
          <Icon name="usb" size={14} />
          FLIPPER ZERO FOUND
        </div>
      )}

      {/* ===== 底部状态文字 ===== */}
      <div
        className="font-mono"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 14,
          color: statusColor,
          letterSpacing: 1,
        }}
      >
        <Icon name={statusIcon} size={16} />
        <span className={!deviceFound && isScanning ? "blink" : undefined}>
          {statusText}
        </span>
      </div>
    </div>
  );
};

export default ScanRadar;
