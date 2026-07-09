/**
 * Dolphin Gang Tour 服务端 — 授权验证 / 更新推送 / 管理控制台
 * 独立端口 3920，不影响现有 proximity-platform (8848)
 */
require("dotenv").config();
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { openDb, RELEASES_DIR } = require("./db");

const PORT = Number(process.env.PORT || 3920);
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const LICENSE_SECRET = process.env.LICENSE_SECRET || "dev-insecure-secret";
const APP_ID = process.env.APP_ID || "com.dolphin-gang-tour.app";
const OFFLINE_GRACE_HOURS = Number(process.env.OFFLINE_GRACE_HOURS || 72);
const PUBLIC_BASE = process.env.PUBLIC_BASE || `http://106.15.105.100:${PORT}`;
const GITHUB_REPO = process.env.GITHUB_REPO || "immaotianyi/dolphin-gang-tour";

const db = openDb();
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  dest: RELEASES_DIR,
  limits: { fileSize: 512 * 1024 * 1024 },
});

function nowIso() {
  return new Date().toISOString();
}

function signToken(licenseKey, machineId, expiresAt) {
  const payload = `${licenseKey}|${machineId}|${expiresAt || "none"}`;
  return crypto.createHmac("sha256", LICENSE_SECRET).update(payload).digest("hex");
}

function verifyToken(licenseKey, machineId, expiresAt, token) {
  if (!token) return false;
  return signToken(licenseKey, machineId, expiresAt) === token;
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers["x-admin-token"] || "";
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  next();
}

function normalizePlatform(raw) {
  const p = String(raw || "").toLowerCase();
  if (p.includes("win")) return "windows-x86_64";
  if (p === "macos-arm64" || p === "arm64" || (p.includes("arm64") && (p.includes("mac") || p.includes("darwin") || p.includes("apple")))) {
    return "macos-arm64";
  }
  if (p === "macos-x64" || p === "macos-x86_64" || p === "x64" || ((p.includes("x64") || p.includes("x86")) && (p.includes("mac") || p.includes("darwin")))) {
    return "macos-x64";
  }
  if (p.includes("mac") || p.includes("darwin")) return "macos-universal";
  if (p.includes("android")) return "android-arm64";
  if (p.includes("ios")) return "ios-arm64";
  if (p.includes("linux")) return "linux-x86_64";
  return p;
}

const PLATFORM_LABELS = {
  "windows-x86_64": "Windows 64-bit",
  "macos-arm64": "macOS (Apple Silicon)",
  "macos-x64": "macOS (Intel)",
  "macos-universal": "macOS (Universal)",
  "linux-x86_64": "Linux 64-bit",
  "android-arm64": "Android (arm64)",
  "ios-arm64": "iOS (iPhone/iPad)",
};

function compareSemver(a, b) {
  const pa = String(a).replace(/^v/i, "").split("-")[0].split(".").map(Number);
  const pb = String(b).replace(/^v/i, "").split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function publicConfig() {
  const s = db.getSettings();
  return {
    maintenanceMode: !!s.maintenance_mode,
    maintenanceMessage: s.maintenance_message || "系统维护中",
    announcement: s.announcement || "",
    updatePushEnabled: s.update_push_enabled !== false,
    licenseVerifyRequired: s.license_verify_required !== false,
    minAppVersion: s.min_app_version || "1.0.0",
    serverTime: nowIso(),
  };
}

function safeReleaseName(name) {
  return path.basename(String(name || "")).replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Beta / 多人测试码：不绑定单一设备，每台设备独立 token */
function isMultiDeviceLicense(row) {
  if (!row) return false;
  return row.multi_device === true || row.plan === "beta";
}

function mimeForRelease(name) {
  const lower = String(name).toLowerCase();
  if (lower.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  if (lower.endsWith(".msi")) return "application/x-msi";
  if (lower.endsWith(".dmg")) return "application/x-apple-diskimage";
  if (lower.endsWith(".deb")) return "application/vnd.debian.binary-package";
  if (lower.endsWith(".appimage")) return "application/x-executable";
  if (lower.endsWith(".apk")) return "application/vnd.android.package-archive";
  if (lower.endsWith(".ipa")) return "application/octet-stream";
  return "application/octet-stream";
}

function releaseFilename(downloadUrl) {
  if (!downloadUrl) return "";
  if (downloadUrl.startsWith("http")) {
    try {
      return safeReleaseName(new URL(downloadUrl).pathname.split("/").pop());
    } catch {
      return safeReleaseName(downloadUrl);
    }
  }
  return safeReleaseName(downloadUrl);
}

function enrichRelease(row) {
  const filename = releaseFilename(row.download_url);
  const downloadUrl = resolveReleaseUrl(row.download_url);
  const local = filename ? path.join(RELEASES_DIR, filename) : "";
  let fileSize = null;
  let fileExists = false;
  if (local && fs.existsSync(local)) {
    fileExists = true;
    fileSize = fs.statSync(local).size;
  }
  const githubDownloadUrl =
    filename && row.version
      ? `https://github.com/${GITHUB_REPO}/releases/download/v${row.version}/${filename}`
      : null;
  return {
    version: row.version,
    platform: row.platform,
    platformLabel: PLATFORM_LABELS[row.platform] || row.platform,
    downloadUrl,
    githubDownloadUrl,
    filename,
    notes: row.notes || "",
    mandatory: !!row.mandatory,
    publishedAt: row.published_at,
    fileSize,
    fileExists,
  };
}

function resolveReleaseUrl(downloadUrl) {
  if (!downloadUrl) return null;
  if (downloadUrl.startsWith("http")) {
    try {
      const u = new URL(downloadUrl);
      const name = safeReleaseName(u.pathname.split("/").pop());
      const local = path.join(RELEASES_DIR, name);
      if (fs.existsSync(local)) {
        return `${PUBLIC_BASE}/releases/${name}`;
      }
    } catch {
      /* ignore */
    }
    return downloadUrl;
  }
  const name = safeReleaseName(downloadUrl);
  const local = path.join(RELEASES_DIR, name);
  if (fs.existsSync(local)) return `${PUBLIC_BASE}/releases/${name}`;
  return `${PUBLIC_BASE}${downloadUrl.startsWith("/") ? "" : "/"}${downloadUrl}`;
}

// ---------- 静态：安装包下载 + 管理页 ----------
app.get("/releases/:file", (req, res) => {
  const safeName = safeReleaseName(req.params.file);
  const filePath = path.join(RELEASES_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: "Installer not found", file: safeName });
  }
  res.setHeader("Content-Type", mimeForRelease(safeName));
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.sendFile(filePath);
});
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "download.html"));
});
app.get("/download", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "download.html"));
});
app.use("/admin", express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  let releaseFiles = [];
  try {
    releaseFiles = fs.readdirSync(RELEASES_DIR).filter((f) => !f.startsWith("."));
  } catch {
    releaseFiles = [];
  }
  res.json({
    ok: true,
    service: "dgt-server",
    version: "1.2.0",
    time: nowIso(),
    releasesDir: RELEASES_DIR,
    releaseCount: releaseFiles.length,
    releases: releaseFiles.slice(0, 20),
  });
});

app.get("/api/v1/config", (_req, res) => {
  res.json({ success: true, data: publicConfig() });
});

app.get("/api/v1/releases", (req, res) => {
  const platformFilter = req.query.platform ? normalizePlatform(req.query.platform) : null;
  let rows = db.listReleases().filter((r) => r.enabled !== false);
  if (platformFilter) rows = rows.filter((r) => r.platform === platformFilter);
  const data = rows.map(enrichRelease);
  res.json({ success: true, data, publicBase: PUBLIC_BASE });
});

app.post("/api/v1/license/activate", (req, res) => {
  const settings = db.getSettings();
  if (settings.maintenance_mode) {
    return res.status(503).json({ success: false, error: settings.maintenance_message || "Maintenance" });
  }

  const { licenseKey, machineId, appVersion, platform, appId } = req.body || {};
  if (!licenseKey || !machineId) {
    return res.status(400).json({ success: false, error: "licenseKey and machineId required" });
  }
  if (appId && appId !== APP_ID) {
    return res.status(403).json({ success: false, error: "Invalid appId" });
  }

  const row = db.getLicense(String(licenseKey).trim().toUpperCase());
  if (!row) return res.status(404).json({ success: false, error: "Invalid license key" });
  if (row.status !== "active") return res.status(403).json({ success: false, error: `License ${row.status}` });
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return res.status(403).json({ success: false, error: "License expired" });
  }
  if (!isMultiDeviceLicense(row) && row.machine_id && row.machine_id !== machineId) {
    return res.status(403).json({ success: false, error: "License already bound to another device" });
  }

  const patch = {
    activated_at: nowIso(),
    note: `${row.note || ""} | activated ${platform || "?"} v${appVersion || "?"}`.trim(),
  };
  if (!isMultiDeviceLicense(row)) {
    patch.machine_id = machineId;
  }
  db.updateLicense(row.license_key, patch);

  const token = signToken(row.license_key, machineId, row.expires_at);
  return res.json({
    success: true,
    data: {
      valid: true,
      licenseKey: row.license_key,
      machineId,
      plan: row.plan,
      expiresAt: row.expires_at,
      token,
      offlineGraceHours: OFFLINE_GRACE_HOURS,
      verifiedAt: nowIso(),
    },
  });
});

app.post("/api/v1/license/verify", (req, res) => {
  const settings = db.getSettings();
  if (settings.maintenance_mode) {
    return res.status(503).json({ success: false, error: settings.maintenance_message || "Maintenance" });
  }

  const { licenseKey, machineId, token } = req.body || {};
  if (!licenseKey || !machineId) {
    return res.status(400).json({ success: false, error: "licenseKey and machineId required" });
  }

  const row = db.getLicense(String(licenseKey).trim().toUpperCase());
  if (!row || row.status !== "active") {
    return res.status(403).json({ success: false, error: "License invalid" });
  }
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return res.status(403).json({ success: false, error: "License expired" });
  }
  if (!isMultiDeviceLicense(row)) {
    if (!row.machine_id) return res.status(403).json({ success: false, error: "License not activated" });
    if (row.machine_id !== machineId) return res.status(403).json({ success: false, error: "Machine mismatch" });
  }
  if (!verifyToken(row.license_key, machineId, row.expires_at, token)) {
    return res.status(403).json({ success: false, error: "Invalid token" });
  }

  const refreshed = signToken(row.license_key, machineId, row.expires_at);
  return res.json({
    success: true,
    data: {
      valid: true,
      plan: row.plan,
      expiresAt: row.expires_at,
      token: refreshed,
      offlineGraceHours: OFFLINE_GRACE_HOURS,
      verifiedAt: nowIso(),
      config: publicConfig(),
    },
  });
});

app.get("/api/v1/updates/latest", (req, res) => {
  const settings = db.getSettings();
  const platform = normalizePlatform(req.query.platform);
  const current = String(req.query.current || "0.0.0");

  if (settings.update_push_enabled === false) {
    return res.json({
      success: true,
      data: {
        updateAvailable: false,
        pushDisabled: true,
        disabledReason: "服务端已暂停更新推送",
        currentVersion: current,
        platform,
        config: publicConfig(),
      },
    });
  }

  const row = db.latestRelease(platform);
  if (!row) {
    return res.json({
      success: true,
      data: { updateAvailable: false, pushDisabled: false, currentVersion: current, platform, config: publicConfig() },
    });
  }

  const updateAvailable = compareSemver(row.version, current) > 0;
  const downloadUrl = resolveReleaseUrl(row.download_url);
  if (!downloadUrl) {
    return res.json({
      success: true,
      data: {
        updateAvailable: false,
        pushDisabled: false,
        currentVersion: current,
        platform,
        disabledReason: "安装包文件不存在，请联系管理员重新上传",
        config: publicConfig(),
      },
    });
  }

  return res.json({
    success: true,
    data: {
      updateAvailable,
      pushDisabled: false,
      currentVersion: current,
      latestVersion: row.version,
      platform,
      downloadUrl,
      releaseNotes: row.notes || "",
      mandatory: !!row.mandatory,
      publishedAt: row.published_at,
      config: publicConfig(),
    },
  });
});

// ---------- 管理 API ----------
app.get("/api/v1/admin/status", requireAdmin, (_req, res) => {
  res.json({
    success: true,
    data: {
      ...db.counts(),
      settings: db.getSettings(),
      port: PORT,
      publicBase: PUBLIC_BASE,
      uptime: process.uptime(),
    },
  });
});

app.patch("/api/v1/admin/settings", requireAdmin, (req, res) => {
  const allowed = [
    "update_push_enabled",
    "license_verify_required",
    "maintenance_mode",
    "maintenance_message",
    "announcement",
    "min_app_version",
  ];
  const patch = {};
  for (const key of allowed) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) {
      patch[key] = req.body[key];
    }
  }
  const settings = db.updateSettings(patch);
  res.json({ success: true, data: settings });
});

app.get("/api/v1/admin/licenses", requireAdmin, (_req, res) => {
  res.json({ success: true, data: db.listLicenses() });
});

app.post("/api/v1/admin/licenses", requireAdmin, (req, res) => {
  const { keys, plan = "standard", expiresAt, note } = req.body || {};
  const list = Array.isArray(keys) ? keys : keys ? [keys] : [];
  if (!list.length) return res.status(400).json({ success: false, error: "keys required" });

  const items = list.map((key) => ({
    license_key: String(key).trim().toUpperCase(),
    plan,
    status: "active",
    machine_id: null,
    activated_at: null,
    expires_at: expiresAt || null,
    note: note || null,
    created_at: nowIso(),
  }));
  const created = db.insertLicenses(items);
  res.json({ success: true, data: { created, total: list.length } });
});

app.post("/api/v1/admin/licenses/revoke", requireAdmin, (req, res) => {
  const { licenseKey } = req.body || {};
  if (!licenseKey) return res.status(400).json({ success: false, error: "licenseKey required" });
  const key = String(licenseKey).trim().toUpperCase();
  db.updateLicense(key, { status: "revoked", machine_id: null });
  res.json({ success: true, data: { licenseKey: key, status: "revoked" } });
});

app.post("/api/v1/admin/licenses/restore", requireAdmin, (req, res) => {
  const { licenseKey } = req.body || {};
  if (!licenseKey) return res.status(400).json({ success: false, error: "licenseKey required" });
  const key = String(licenseKey).trim().toUpperCase();
  db.updateLicense(key, { status: "active" });
  res.json({ success: true, data: { licenseKey: key, status: "active" } });
});

app.get("/api/v1/admin/releases", requireAdmin, (_req, res) => {
  res.json({ success: true, data: db.listReleases() });
});

app.post("/api/v1/admin/releases", requireAdmin, (req, res) => {
  const { version, platform, downloadUrl, notes, mandatory = false, enabled = true } = req.body || {};
  if (!version || !platform || !downloadUrl) {
    return res.status(400).json({ success: false, error: "version, platform, downloadUrl required" });
  }
  const normalized = normalizePlatform(platform);
  db.upsertRelease({
    version,
    platform: normalized,
    download_url: downloadUrl,
    notes: notes || "",
    mandatory: !!mandatory,
    enabled: !!enabled,
  });
  res.json({
    success: true,
    data: { version, platform: normalized, downloadUrl, mandatory: !!mandatory, enabled: !!enabled },
  });
});

app.patch("/api/v1/admin/releases/toggle", requireAdmin, (req, res) => {
  const { version, platform, enabled } = req.body || {};
  if (!version || !platform || enabled === undefined) {
    return res.status(400).json({ success: false, error: "version, platform, enabled required" });
  }
  const row = db.setReleaseEnabled(version, normalizePlatform(platform), !!enabled);
  if (!row) return res.status(404).json({ success: false, error: "Release not found" });
  res.json({ success: true, data: row });
});

app.post("/api/v1/admin/upload", requireAdmin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: "file required" });
  const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const finalPath = path.join(RELEASES_DIR, safeName);
  fs.renameSync(req.file.path, finalPath);
  const url = `${PUBLIC_BASE}/releases/${safeName}`;
  res.json({
    success: true,
    data: { filename: safeName, downloadUrl: url, size: fs.statSync(finalPath).size },
  });
});

app.listen(PORT, HOST, () => {
  console.log(`[dgt-server] http://${HOST}:${PORT}`);
  console.log(`[dgt-server] download page: http://${HOST}:${PORT}/download`);
  console.log(`[dgt-server] admin panel: http://${HOST}:${PORT}/admin/`);
});
