/** 像素风面板组件 */
import React from "react";

interface PixelPanelProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  actions?: React.ReactNode;
}

export const PixelPanel: React.FC<PixelPanelProps> = ({
  title,
  children,
  className = "",
  style,
  actions,
}) => {
  return (
    <div className={`pixel-panel ${className}`} style={style}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="pixel-panel-header" style={{ flex: 1 }}>
            {title}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
};
