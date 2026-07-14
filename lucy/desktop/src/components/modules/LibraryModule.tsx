/** LibraryModule — 资产库页面 (SQLite + 标签 + 搜索 + 收藏 + 导出) */
import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui/Icon";
import { showToast } from "@/components/ui/Toast";
import { invoke } from "@/lib/tauri";
import type { AssetStats, NfcCardAsset, SubghzSignalAsset, IrRemoteAsset, BadusbScriptAsset, AuditLogEntry, IconName } from "@/types";

type LibraryTab = "nfc_cards" | "subghz_signals" | "ir_remotes" | "badusb_scripts" | "audit_logs";
type LibraryItem = NfcCardAsset | SubghzSignalAsset | IrRemoteAsset | BadusbScriptAsset | AuditLogEntry;
type TFunc = (key: string, options?: Record<string, unknown>) => string;

const TABS: { id: LibraryTab; labelKey: string; icon: IconName; listCmd: string; deleteCmd?: string }[] = [
  { id: "nfc_cards", labelKey: "library.tabs.nfc", icon: "nfc", listCmd: "cmd_nfc_list", deleteCmd: "cmd_nfc_delete" },
  { id: "subghz_signals", labelKey: "library.tabs.subghz", icon: "radio", listCmd: "cmd_subghz_list" },
  { id: "ir_remotes", labelKey: "library.tabs.ir", icon: "ir", listCmd: "cmd_ir_list" },
  { id: "badusb_scripts", labelKey: "library.tabs.badusb", icon: "keyboard", listCmd: "cmd_badusb_list" },
  { id: "audit_logs", labelKey: "library.tabs.audit", icon: "shield", listCmd: "cmd_audit_list" },
];

const RISK_COLORS: Record<string, string> = {
  safe: "var(--c-green)", caution: "var(--c-yellow)",
  dangerous: "var(--c-orange)", blocked: "var(--c-red)",
};

// ── Helpers ──

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

function formatFreq(hz: number): string {
  return `${(hz / 1e6).toFixed(2)} MHz`;
}

function getItemLabel(item: LibraryItem): string {
  if ("uid" in item) return item.label || item.uid;
  if ("frequency" in item) return item.label || formatFreq(item.frequency);
  if ("buttons" in item) return item.label || item.name;
  if ("content" in item) return item.name;
  if ("command" in item) return item.command;
  return (item as { id: string }).id;
}

function getItemSubLabel(item: LibraryItem): string {
  if ("card_type" in item) return item.card_type;
  if ("frequency" in item) return `${item.modulation} | ${item.protocol || "?"}`;
  if ("buttons" in item) return `${item.brand || "?"} | ${item.protocol || ""}`;
  if ("content" in item) return `${item.risk_level} | ${item.executed_count}x`;
  if ("command" in item) return `${item.module} | ${item.risk_level}`;
  return "";
}

function isStarred(item: LibraryItem): boolean {
  return "starred" in item ? item.starred : false;
}

function getTags(item: LibraryItem): string[] {
  if ("tags" in item && item.tags) return item.tags.split(",").map(t => t.trim()).filter(Boolean);
  return [];
}

function hasDelete(item: LibraryItem): boolean {
  return "uid" in item || "frequency" in item || "buttons" in item || "content" in item;
}

function renderDetailFields(item: LibraryItem, t: TFunc): Array<{ label: string; value: string }> {
  const fields: Array<{ label: string; value: string }> = [];
  if ("uid" in item) {
    fields.push({ label: t("library.uid"), value: item.uid });
    fields.push({ label: t("library.type"), value: item.card_type });
    if (item.manufacturer) fields.push({ label: t("nfc.manufacturer"), value: item.manufacturer });
    fields.push({ label: t("library.createdAt"), value: formatTime(item.created_at) });
  } else if ("frequency" in item) {
    fields.push({ label: t("library.frequency"), value: formatFreq(item.frequency) });
    fields.push({ label: t("library.modulation"), value: item.modulation });
    if (item.protocol) fields.push({ label: t("library.protocol"), value: item.protocol });
    if (item.rssi !== undefined) fields.push({ label: t("subghz.rssi"), value: `${item.rssi} dBm` });
    fields.push({ label: t("library.createdAt"), value: formatTime(item.created_at) });
  } else if ("buttons" in item) {
    fields.push({ label: t("library.brand"), value: item.brand || "--" });
    if (item.protocol) fields.push({ label: t("library.protocol"), value: item.protocol });
    let btnCount = 0;
    try { btnCount = JSON.parse(item.buttons).length; } catch { /* empty */ }
    fields.push({ label: t("library.buttons"), value: String(btnCount) });
    fields.push({ label: t("library.createdAt"), value: formatTime(item.created_at) });
  } else if ("content" in item) {
    fields.push({ label: t("library.riskLevel"), value: item.risk_level });
    fields.push({ label: t("library.execCount"), value: String(item.executed_count) });
    if (item.last_executed_at) fields.push({ label: t("library.lastExec"), value: formatTime(item.last_executed_at) });
    fields.push({ label: t("library.createdAt"), value: formatTime(item.created_at) });
  } else if ("command" in item) {
    fields.push({ label: "Module", value: item.module });
    fields.push({ label: t("library.riskLevel"), value: item.risk_level });
    fields.push({ label: "Source", value: item.source });
    fields.push({ label: "Result", value: item.result });
    if (item.detail) fields.push({ label: "Detail", value: item.detail });
    fields.push({ label: t("library.createdAt"), value: formatTime(item.timestamp) });
  }
  return fields;
}

// ── Sub-components ──

const StatCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div style={{
    padding: "0.25rem 0.5rem",
    background: "var(--c-bg3)",
    border: "1px solid var(--c-rule)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minWidth: "52px",
  }}>
    <span className="font-mono" style={{ fontSize: "0.85rem", color, fontWeight: 700 }}>{value}</span>
    <span className="font-mono text-muted" style={{ fontSize: "0.52rem", whiteSpace: "nowrap" }}>{label}</span>
  </div>
);

const AssetCard: React.FC<{ item: LibraryItem; onClick: () => void; onStar: () => void; t: TFunc }> = ({ item, onClick, onStar, t: _t }) => {
  const label = getItemLabel(item);
  const subLabel = getItemSubLabel(item);
  const tags = getTags(item);
  const starred = isStarred(item);
  return (
    <div onClick={onClick} style={{
      padding: "0.5rem",
      background: "var(--c-bg2)",
      border: "2px solid var(--c-rule)",
      cursor: "pointer",
      transition: "all 0.2s var(--ease-apple)",
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--c-orange)"; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--c-rule)"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span className="font-term text-ink" style={{ fontSize: "0.78rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        {"starred" in item && (
          <button onClick={(e) => { e.stopPropagation(); onStar(); }} style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0", flexShrink: 0 }}>
            <Icon name="star" size={11} style={{ color: starred ? "var(--c-yellow)" : "var(--c-muted)" }} />
          </button>
        )}
      </div>
      <div className="font-mono text-dim" style={{ fontSize: "0.62rem", marginTop: "0.15rem" }}>{subLabel}</div>
      {tags.length > 0 && (
        <div style={{ display: "flex", gap: "0.15rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
          {tags.map(tag => (
            <span key={tag} style={{
              padding: "0.08rem 0.25rem",
              background: "var(--c-bg3)",
              border: "1px solid var(--c-rule)",
              fontSize: "0.52rem",
              fontFamily: "var(--font-mono)",
              color: "var(--c-muted)",
            }}>{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
};

const AssetRow: React.FC<{ item: LibraryItem; onClick: () => void; onStar: () => void }> = ({ item, onClick, onStar }) => {
  const label = getItemLabel(item);
  const subLabel = getItemSubLabel(item);
  const starred = isStarred(item);
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: "0.4rem",
      padding: "0.35rem 0.5rem",
      background: "var(--c-bg2)",
      border: "1px solid var(--c-rule)",
      cursor: "pointer",
      transition: "all 0.2s var(--ease-apple)",
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--c-orange)"; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--c-rule)"; }}
    >
      <span className="font-term text-ink" style={{ fontSize: "0.76rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span className="font-mono text-dim" style={{ fontSize: "0.62rem" }}>{subLabel}</span>
      {"starred" in item && (
        <button onClick={(e) => { e.stopPropagation(); onStar(); }} style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0" }}>
          <Icon name="star" size={11} style={{ color: starred ? "var(--c-yellow)" : "var(--c-muted)" }} />
        </button>
      )}
    </div>
  );
};

const DetailPanel: React.FC<{ item: LibraryItem; onClose: () => void; onDelete: (id: string) => void; onStar: () => void; t: TFunc }> = ({ item, onClose, onDelete, onStar, t }) => {
  const label = getItemLabel(item);
  const subLabel = getItemSubLabel(item);
  const tags = getTags(item);
  const starred = isStarred(item);
  const fields = renderDetailFields(item, t);
  const canDelete = hasDelete(item);
  const riskColor = "risk_level" in item ? RISK_COLORS[item.risk_level] || "var(--c-dim)" : "var(--c-dim)";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
        <span className="font-pixel text-orange" style={{ fontSize: "0.58rem", letterSpacing: "0.08em" }}>{t("library.detail")}</span>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0" }}>
          <Icon name="close" size={13} style={{ color: "var(--c-muted)" }} />
        </button>
      </div>

      <div className="font-term text-ink" style={{ fontSize: "0.82rem", marginBottom: "0.15rem" }}>{label}</div>
      <div className="font-mono text-dim" style={{ fontSize: "0.68rem", marginBottom: "0.4rem" }}>{subLabel}</div>

      {/* Risk badge for items with risk_level */}
      {"risk_level" in item && (
        <div style={{ marginBottom: "0.4rem" }}>
          <span style={{
            display: "inline-block",
            padding: "0.15rem 0.4rem",
            border: `1px solid ${riskColor}`,
            color: riskColor,
            fontSize: "0.58rem",
            fontFamily: "var(--font-mono)",
          }}>
            {t(`risk.${item.risk_level}`)}
          </span>
        </div>
      )}

      {/* Fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginBottom: "0.4rem" }}>
        {fields.map((field, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <span className="font-mono text-muted" style={{ fontSize: "0.62rem", flexShrink: 0 }}>{field.label}</span>
            <span className="font-mono text-ink" style={{ fontSize: "0.62rem", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{field.value}</span>
          </div>
        ))}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{ marginBottom: "0.4rem" }}>
          <div className="font-mono text-muted" style={{ fontSize: "0.58rem", marginBottom: "0.15rem" }}>{t("library.tags")}</div>
          <div style={{ display: "flex", gap: "0.15rem", flexWrap: "wrap" }}>
            {tags.map(tag => (
              <span key={tag} style={{ padding: "0.08rem 0.25rem", background: "var(--c-bg3)", border: "1px solid var(--c-rule)", fontSize: "0.52rem", fontFamily: "var(--font-mono)", color: "var(--c-muted)" }}>{tag}</span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.4rem" }}>
        {"starred" in item && (
          <button onClick={onStar} style={actionBtn(starred ? "var(--c-yellow)" : "var(--c-muted)")}>
            <Icon name="star" size={11} />
            <span>{starred ? t("library.unstar") : t("library.star")}</span>
          </button>
        )}
        {canDelete && (
          <button onClick={() => onDelete(item.id)} style={actionBtn("var(--c-red)")}>
            <Icon name="trash" size={11} />
            <span>{t("library.delete")}</span>
          </button>
        )}
      </div>
    </div>
  );
};

function actionBtn(color: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: "0.2rem",
    padding: "0.25rem 0.45rem",
    background: "transparent",
    border: `2px solid ${color}`,
    color,
    fontFamily: "var(--font-term)",
    fontSize: "0.62rem",
    cursor: "pointer",
    transition: "all 0.2s var(--ease-apple)",
  };
}

// ── Main Component ──

export const LibraryModule: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<LibraryTab>("nfc_cards");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [starredOnly, setStarredOnly] = useState(false);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [stats, setStats] = useState<AssetStats | null>(null);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const result = await invoke<AssetStats>("cmd_asset_stats");
      setStats(result);
    } catch (e) {
      console.error("[Library] stats error:", e);
    }
  }, []);

  const loadItems = useCallback(async (tab: LibraryTab) => {
    setLoading(true);
    try {
      const cfg = TABS.find(t => t.id === tab);
      if (!cfg) return;
      const result = await invoke<LibraryItem[]>(cfg.listCmd);
      setItems(result);
    } catch (e) {
      console.error("[Library] load error:", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadItems(activeTab); }, [activeTab, loadItems]);

  const filteredItems = items.filter(item => {
    if (starredOnly && !isStarred(item)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const haystack = [getItemLabel(item), getItemSubLabel(item), getTags(item).join(" ")]
        .join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const handleExport = () => {
    const json = JSON.stringify(filteredItems, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      showToast("success", t("library.exportSuccess"));
    }).catch(() => {
      showToast("error", "Export failed");
    });
  };

  const handleDelete = async (id: string) => {
    const cfg = TABS.find(t => t.id === activeTab);
    if (!cfg?.deleteCmd) return;
    try {
      await invoke(cfg.deleteCmd, { id });
      showToast("success", t("library.deleteSuccess"));
      loadItems(activeTab);
      loadStats();
      setSelectedItem(null);
    } catch (e) {
      showToast("error", "Delete failed");
    }
  };

  const toggleStar = (item: LibraryItem) => {
    if (!("starred" in item)) return;
    setItems(prev => prev.map(i => {
      if (i.id === item.id && "starred" in i) {
        return { ...i, starred: !i.starred } as LibraryItem;
      }
      return i;
    }));
    if (selectedItem?.id === item.id && "starred" in selectedItem) {
      setSelectedItem({ ...selectedItem, starred: !selectedItem.starred } as LibraryItem);
    }
  };

  const totalAssets = stats ? Object.values(stats).reduce((a, b) => a + b, 0) : 0;
  const starredCount = items.filter(isStarred).length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "0.7rem 1rem", borderBottom: "2px solid var(--c-rule)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 className="font-pixel text-orange" style={{ fontSize: "0.78rem", letterSpacing: "0.08em", margin: 0 }}>
              {t("library.title")}
            </h2>
            <p className="font-mono text-dim" style={{ fontSize: "0.68rem", margin: "0.15rem 0 0" }}>
              {t("library.subtitle")}
            </p>
          </div>
          <button onClick={handleExport} style={{
            display: "flex", alignItems: "center", gap: "0.25rem",
            padding: "0.3rem 0.6rem",
            background: "transparent",
            border: "2px solid var(--c-cyan)",
            color: "var(--c-cyan)",
            fontFamily: "var(--font-term)",
            fontSize: "0.7rem",
            cursor: "pointer",
            transition: "all 0.2s var(--ease-apple)",
          }}>
            <Icon name="export" size={11} />
            <span>{t("library.export")}</span>
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div style={{ display: "flex", gap: "0.35rem", padding: "0.4rem 1rem", borderBottom: "1px solid var(--c-rule)", overflowX: "auto" }}>
          <StatCard label={t("library.totalAssets")} value={totalAssets} color="var(--c-cyan)" />
          <StatCard label={t("library.starredAssets")} value={starredCount} color="var(--c-yellow)" />
          {TABS.map(tab => (
            <StatCard key={tab.id} label={t(tab.labelKey)} value={stats[tab.id] || 0} color="var(--c-dim)" />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "2px solid var(--c-rule)" }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedItem(null); }} style={{
            display: "flex", alignItems: "center", gap: "0.35rem",
            padding: "0.45rem 0.7rem",
            background: activeTab === tab.id ? "rgba(249,115,22,0.05)" : "transparent",
            border: "none",
            borderBottom: activeTab === tab.id ? "3px solid var(--c-orange)" : "3px solid transparent",
            color: activeTab === tab.id ? "var(--c-orange)" : "var(--c-dim)",
            fontFamily: "var(--font-term)",
            fontSize: "0.72rem",
            cursor: "pointer",
            transition: "all 0.2s var(--ease-apple)",
          }}>
            <Icon name={tab.icon} size={13} />
            <span>{t(tab.labelKey)}</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "0.4rem", padding: "0.4rem 1rem", borderBottom: "1px solid var(--c-rule)", alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Icon name="search" size={11} style={{ position: "absolute", left: "0.5rem", top: "50%", transform: "translateY(-50%)", color: "var(--c-muted)" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t("library.search")}
            style={{
              width: "100%",
              padding: "0.3rem 0.5rem 0.3rem 1.6rem",
              background: "var(--c-bg3)",
              border: "2px solid var(--c-rule)",
              color: "var(--c-ink)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              outline: "none",
            }}
          />
        </div>
        <button onClick={() => setStarredOnly(!starredOnly)} style={{
          display: "flex", alignItems: "center", gap: "0.2rem",
          padding: "0.3rem 0.45rem",
          background: starredOnly ? "rgba(250,204,21,0.1)" : "transparent",
          border: `2px solid ${starredOnly ? "var(--c-yellow)" : "var(--c-rule)"}`,
          color: starredOnly ? "var(--c-yellow)" : "var(--c-dim)",
          cursor: "pointer",
          transition: "all 0.2s var(--ease-apple)",
        }}>
          <Icon name="star" size={11} />
        </button>
        <div style={{ display: "flex", border: "2px solid var(--c-rule)" }}>
          <button onClick={() => setViewMode("grid")} style={{
            padding: "0.3rem 0.45rem",
            background: viewMode === "grid" ? "var(--c-bg3)" : "transparent",
            border: "none",
            color: viewMode === "grid" ? "var(--c-orange)" : "var(--c-dim)",
            cursor: "pointer",
          }}>
            <Icon name="grid" size={11} />
          </button>
          <button onClick={() => setViewMode("list")} style={{
            padding: "0.3rem 0.45rem",
            background: viewMode === "list" ? "var(--c-bg3)" : "transparent",
            border: "none",
            color: viewMode === "list" ? "var(--c-orange)" : "var(--c-dim)",
            cursor: "pointer",
          }}>
            <Icon name="list" size={11} />
          </button>
        </div>
      </div>

      {/* Content + Detail */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, overflow: "auto", padding: "0.4rem" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <Icon name="refresh" size={22} style={{ color: "var(--c-muted)", animation: "spin 1s linear infinite" }} />
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <Icon name="folder" size={28} style={{ color: "var(--c-muted)", marginBottom: "0.4rem" }} />
              <div className="font-term text-dim" style={{ fontSize: "0.78rem" }}>{t("library.empty")}</div>
              <div className="font-mono text-muted" style={{ fontSize: "0.68rem", marginTop: "0.2rem" }}>{t("library.emptyHint")}</div>
            </div>
          ) : viewMode === "grid" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "0.4rem" }}>
              {filteredItems.map(item => (
                <AssetCard key={item.id} item={item} onClick={() => setSelectedItem(item)} onStar={() => toggleStar(item)} t={t} />
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
              {filteredItems.map(item => (
                <AssetRow key={item.id} item={item} onClick={() => setSelectedItem(item)} onStar={() => toggleStar(item)} />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedItem && (
          <div style={{
            width: "260px",
            borderLeft: "2px solid var(--c-rule)",
            padding: "0.6rem",
            overflow: "auto",
            animation: "slide-in-up 0.3s var(--ease-apple)",
            flexShrink: 0,
          }}>
            <DetailPanel item={selectedItem} onClose={() => setSelectedItem(null)} onDelete={handleDelete} onStar={() => toggleStar(selectedItem)} t={t} />
          </div>
        )}
      </div>
    </div>
  );
};
