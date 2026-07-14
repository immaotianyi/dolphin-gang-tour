/** 像素风按钮组件 */
import React from "react";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/types";

type Variant = "default" | "primary" | "danger" | "success" | "ghost";

interface PixelButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: IconName | React.ReactNode;
  iconSize?: number;
}

export const PixelButton: React.FC<PixelButtonProps> = ({
  variant = "default",
  icon,
  iconSize = 14,
  children,
  className = "",
  ...props
}) => {
  const variantClass =
    variant === "primary" ? "pixel-btn-primary" :
    variant === "danger" ? "pixel-btn-danger" :
    variant === "success" ? "pixel-btn-success" :
    variant === "ghost" ? "pixel-btn-ghost" :
    "";

  const iconEl = icon
    ? typeof icon === "string"
      ? <Icon name={icon as IconName} size={iconSize} style={{ flexShrink: 0 }} />
      : icon
    : null;

  return (
    <button className={`pixel-btn ${variantClass} ${className}`} {...props}>
      {iconEl}
      {children}
    </button>
  );
};
