/** 像素风输入框组件 */
import React from "react";

interface PixelInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  prefix?: string;
}

export const PixelInput: React.FC<PixelInputProps> = ({
  label,
  prefix,
  className = "",
  ...props
}) => {
  return (
    <div style={{ width: "100%" }}>
      {label && (
        <label className="font-pixel text-dim" style={{ fontSize: "0.65rem", display: "block", marginBottom: "0.3rem", letterSpacing: "0.05em" }}>
          {label}
        </label>
      )}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {prefix && (
          <span className="font-mono text-muted" style={{ position: "absolute", left: "0.5rem", fontSize: "0.8rem", pointerEvents: "none" }}>
            {prefix}
          </span>
        )}
        <input
          className={`pixel-input ${className}`}
          style={prefix ? { paddingLeft: "1.8rem" } : undefined}
          {...props}
        />
      </div>
    </div>
  );
};
