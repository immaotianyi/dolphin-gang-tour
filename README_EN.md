<div align="center">

# 🐬 Dolphin Gang Tour

**Full-featured Flipper Zero desktop companion — resources, firmware, AI tutoring, virtual device**

[![Release](https://img.shields.io/github/v/release/immaotianyi/dolphin-gang-tour?label=release)](https://github.com/immaotianyi/dolphin-gang-tour/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%Linux%20%7C%20Android%20%7C%20iOS-blue)]()
[![Framework](https://img.shields.io/badge/framework-Tauri%202%20%2B%20React%2018-orange)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

**[中文版 README](./README.md)** · **[Releases](https://github.com/immaotianyi/dolphin-gang-tour/releases)** · **[Mirror download](http://106.15.105.100:3920/download)** · **[Changelog](./flipper-ai-tutor/CHANGELOG.md)**

</div>

---

## Download

> Like [cc-switch Releases](https://github.com/farion1231/cc-switch/releases): **version × platform** matrix with GitHub + mirror links.

### v2.0beta · Latest

| Platform | Package | Size | Download |
|----------|---------|------|----------|
| **Windows x64** | `Dolphin-Gang-Tour-v2.0beta-Windows-x64-Setup.exe` | 3.8 MB | [GitHub](https://github.com/immaotianyi/dolphin-gang-tour/releases/download/v2.0.0-beta.0/Dolphin-Gang-Tour-v2.0beta-Windows-x64-Setup.exe) · [Mirror](http://106.15.105.100:3920/releases/Dolphin-Gang-Tour-v2.0beta-Windows-x64-Setup.exe) |
| **macOS Apple Silicon** | `Dolphin-Gang-Tour-v2.0beta-macOS-arm64.dmg` | 2.6 MB | [GitHub](https://github.com/immaotianyi/dolphin-gang-tour/releases/download/v2.0.0-beta.0/Dolphin-Gang-Tour-v2.0beta-macOS-arm64.dmg) · [Mirror](http://106.15.105.100:3920/releases/Dolphin-Gang-Tour-v2.0beta-macOS-arm64.dmg) |
| **macOS Intel** | `Dolphin-Gang-Tour-v2.0beta-macOS-x64.dmg` | 2.8 MB | [GitHub](https://github.com/immaotianyi/dolphin-gang-tour/releases/download/v2.0.0-beta.0/Dolphin-Gang-Tour-v2.0beta-macOS-x64.dmg) · [Mirror](http://106.15.105.100:3920/releases/Dolphin-Gang-Tour-v2.0beta-macOS-x64.dmg) |
| **Android arm64** | `Dolphin-Gang-Tour-v2.0beta-Android-arm64.apk` | 10.6 MB | [GitHub](https://github.com/immaotianyi/dolphin-gang-tour/releases/download/v2.0.0-beta.0/Dolphin-Gang-Tour-v2.0beta-Android-arm64.apk) · [Mirror](http://106.15.105.100:3920/releases/Dolphin-Gang-Tour-v2.0beta-Android-arm64.apk) |

### v1.2beta · Previous

| Platform | Package | Size | Download |
|----------|---------|------|----------|
| **Windows x64** | `Dolphin-Gang-Tour-v1.2beta-Windows-x64-Setup.exe` | 3.9 MB | [GitHub](https://github.com/immaotianyi/dolphin-gang-tour/releases/download/v1.2.0-beta.0/Dolphin-Gang-Tour-v1.2beta-Windows-x64-Setup.exe) · [Mirror](http://106.15.105.100:3920/releases/Dolphin-Gang-Tour-v1.2beta-Windows-x64-Setup.exe) |

**[All versions & SHA256 →](./DOWNLOADS_EN.md)**

> **Beta license key:** `DGT-BETA-2026` (online check is version-only; no Flipper/NFC data collected)

> ⚠️ **Unofficial product** — not affiliated with Flipper Devices Inc. Download only from [GitHub Releases](https://github.com/immaotianyi/dolphin-gang-tour/releases) or the mirror above.

---

## Overview

**Dolphin Gang Tour** is a desktop companion for Flipper Zero enthusiasts. It does not replace qFlipper; it adds resource import, multi-firmware flashing, live screen mirroring, AI tutoring, and virtual device simulation.

**No hardware required** — built-in virtual device mode runs the full interaction flow on PC, phone, or tablet.

---

## Key Features

### Virtual device (no hardware)

- Auto-discovers "Flipper Zero (Virtual Demo)" on scan
- Virtual screen mirror (128×64 animated frames)
- Full import pipeline with integrity checks

### One-click resource import

7 built-in packs: IR remotes, SubGHz signals, BadUSB scripts, NFC cards, and more.

### Firmware flashing

Supports Momentum, Unleashed, Official (OFW), and RogueMaster — RPC and DFU tracks.

### AI tutoring

Built-in Flipper knowledge base, multi-model support, automatic PII sanitization.

### Screen mirroring

128×64 live frames via RPC; virtual button remote control.

### Mobile editions

- **Android**: virtual device + USB OTG dock for real Flipper
- **iOS**: virtual device (USB limited by platform)

---

## Tech stack

- **Frontend:** React 18 + TypeScript + Zustand + Vite 5
- **Backend:** Rust + Tauri 2 + tokio
- **Protocol:** Flipper RPC (protobuf over USB CDC-ACM)

---

## Quick start

### Requirements

- Rust 1.75+, Node.js 18+, Tauri CLI 2.0

### Run from source

```bash
git clone https://github.com/immaotianyi/dolphin-gang-tour.git
cd dolphin-gang-tour/flipper-ai-tutor
npm install
npm run tauri dev
```

### Build installers

```powershell
# Windows
python scripts/build-to-desktop.py

# Android (signed APK)
npm run tauri:android:build

# macOS (on Mac or via GitHub Actions)
./scripts/build-macos.sh
```

### Publish GitHub Release

```powershell
gh auth login
powershell -ExecutionPolicy Bypass -File scripts/publish-github-release.ps1
```

---

## Android install fix (v2.0.0-beta.0)

Release APKs are now signed with **APK Signature Scheme v2/v3**. This fixes `packageInfo is null` parse errors on MIUI and Android 11+ when installing unsigned builds.

If you installed a previous unsigned APK, **uninstall it first**, then install the signed release.

---

## Known limitations

- SD card format / bad-sector detection not available via RPC (device-side action required)
- Windows driver auto-detection returns `unknown` (SetupAPI pending)
- games-pack / themes-pack require user-downloaded `.fap` / `.asset` files

See [README.md](./README.md) (Chinese) for the full feature matrix and architecture diagrams.

---

## License

For learning and research only. Comply with local laws.

Flipper Zero is a trademark of Flipper Devices Inc. This project is **not** affiliated with Flipper Devices Inc.

**Developer:** naante845

---

## Acknowledgments

- [Flipper Devices](https://flipperzero.one/)
- [Momentum Firmware](https://github.com/Next-Flip/Momentum-Firmware)
- [Unleashed Firmware](https://github.com/DarkFlippers/unleashed-firmware)
- [Tauri](https://tauri.app/) · [React](https://react.dev/)
