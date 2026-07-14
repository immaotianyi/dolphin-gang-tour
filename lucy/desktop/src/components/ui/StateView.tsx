/** 统一状态视图 — loading / empty / error / disabled */
import React from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui/Icon";
import { PixelButton } from "@/components/ui/PixelButton";
import type { IconName } from "@/types";

type StateType = "loading" | "empty" | "error" | "disabled";

interface StateViewProps {
  type: StateType;
  icon?: IconName;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const STATE_CONFIG: Record<StateType, { icon: IconName; color: string }> = {
  loading: { icon: "refresh", color: "var(--c-cyan)" },
  empty: { icon: "search", color: "var(--c-muted)" },
  error: { icon: "cross", color: "var(--c-red)" },
  disabled: { icon: "lock", color: "var(--c-yellow)" },
};

export const StateView: React.FC<StateViewProps> = ({
  type,
  icon,
  title,
  message,
  actionLabel,
  onAction,
}) => {
  const { t } = useTranslation();
  const config = STATE_CONFIG[type];
  const iconName = icon || config.icon;

  const defaultTitle = type === "loading" ? t("common.loading") :
                       type === "empty" ? t("common.noData") :
                       type === "error" ? t("common.error") :
                       t("common.disabled");

  const defaultMessage = type === "loading" ? t("common.loadingHint") :
                         type === "empty" ? t("common.emptyHint") :
                         type === "error" ? t("common.errorHint") :
                         t("common.disabledHint");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 1rem",
        textAlign: "center",
        gap: "0.6rem",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `2px solid ${config.color}`,
          background: "var(--c-bg3)",
          opacity: type === "empty" ? 0.4 : 1,
          animation: type === "loading" ? "spin 1s linear infinite" : undefined,
        }}
      >
        <Icon name={iconName} size={28} style={{ color: config.color }} />
      </div>
      <div className="font-pixel" style={{ fontSize: "0.85rem", color: config.color }}>
        {title || defaultTitle}
      </div>
      {message || defaultMessage ? (
        <div className="font-term text-dim" style={{ fontSize: "0.75rem", maxWidth: 320, lineHeight: 1.5 }}>
          {message || defaultMessage}
        </div>
      ) : null}
      {actionLabel && onAction && (
        <PixelButton
          variant="primary"
          onClick={onAction}
          style={{ marginTop: "0.4rem", fontSize: "0.7rem", padding: "0.3rem 0.8rem" }}
        >
          {actionLabel}
        </PixelButton>
      )}
    </div>
  );
};
