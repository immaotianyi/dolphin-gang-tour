# DolphinTutor 第三方组件许可证声明

本文件列出 DolphinTutor 使用的所有第三方开源组件及其许可证信息。
依据各开源许可证要求，在此声明版权和许可证信息。

最后更新：2026年7月7日

---

## 一、Rust 后端依赖

| 组件 | 版本 | 许可证 | 版权人 |
|------|------|--------|--------|
| anyhow | 1.0 | MIT OR Apache-2.0 | David Tolnay |
| base64 | 0.22 | MIT OR Apache-2.0 | Alice Maz |
| bytes | 1.12 | MIT | Carl Lerche |
| chrono | 0.4 | MIT/Apache-2.0 | Kang Seonghoon |
| crc32fast | 1.5 | MIT OR Apache-2.0 | Svante Seleborg |
| directories | 5.0 | MIT/Apache-2.0 | Simon Sapin |
| env_logger | 0.11 | MIT OR Apache-2.0 | The Rust Project Developers |
| flate2 | 1.1 | MIT OR Apache-2.0 | Alex Crichton |
| futures-util | 0.3 | MIT OR Apache-2.0 | Alex Crichton, Futures-RS Contributors |
| hex | 0.4 | MIT OR Apache-2.0 | KokaKiwi |
| keyring | 3.6 | MIT OR Apache-2.0 | Walther Chen |
| log | 0.4 | MIT OR Apache-2.0 | The Rust Project Developers |
| parking_lot | 0.12 | MIT OR Apache-2.0 | Amanieu d'Antras |
| prost | 0.13 | MIT | Dan Burkert, Lucio Franco |
| prost-types | 0.13 | MIT | Dan Burkert |
| regex | 1.12 | MIT OR Apache-2.0 | The Rust Project Developers |
| reqwest | 0.12 | MIT OR Apache-2.0 | Sean McArthur |
| serde | 1.0 | MIT OR Apache-2.0 | The Rust Project Developers |
| serde_json | 1.0 | MIT OR Apache-2.0 | The Rust Project Developers |
| serialport | 4.9 | MIT OR Apache-2.0 | Bryant Mairs |
| sha2 | 0.10 | MIT OR Apache-2.0 | The RustCrypto Project Developers |
| sysinfo | 0.31 | MIT | Guillaume Gomez |
| tar | 0.4 | MIT OR Apache-2.0 | Alex Crichton |
| tauri | 2.11 | MIT OR Apache-2.0 | Tauri Programme within The Commons Conservancy |
| tauri-plugin-dialog | 2.7 | MIT OR Apache-2.0 | Tauri Programme |
| tauri-plugin-shell | 2.3 | MIT OR Apache-2.0 | Tauri Programme |
| thiserror | 1.0 | MIT OR Apache-2.0 | David Tolnay |
| tokio | 1.52 | MIT OR Apache-2.0 | Tokio Contributors |
| tokio-stream | 0.1 | MIT OR Apache-2.0 | Tokio Contributors |
| url | 2.5 | MIT OR Apache-2.0 | The url-rs developers |
| zip | 2.4 | MIT OR Apache-2.0 | Mathieu Rocher |

### Windows 平台条件依赖

| 组件 | 版本 | 许可证 | 版权人 |
|------|------|--------|--------|
| windows | 0.61 | MIT OR Apache-2.0 | Microsoft |

### Build dependencies

| 组件 | 版本 | 许可证 |
|------|------|--------|
| prost-build | 0.13 | MIT |
| tauri-build | 2.6 | MIT OR Apache-2.0 |

---

## 二、前端依赖

| 组件 | 版本 | 许可证 | 版权人 |
|------|------|--------|--------|
| @tauri-apps/api | ^2.0 | MIT OR Apache-2.0 | Tauri Programme |
| @tauri-apps/plugin-dialog | ^2.7 | MIT OR Apache-2.0 | Tauri Programme |
| @tauri-apps/plugin-shell | ^2.0 | MIT OR Apache-2.0 | Tauri Programme |
| react | ^18.3 | MIT | Meta Platforms, Inc. |
| react-dom | ^18.3 | MIT | Meta Platforms, Inc. |
| zustand | ^4.5 | MIT | Paul Henschel |

### Dev dependencies

| 组件 | 版本 | 许可证 |
|------|------|--------|
| @tauri-apps/cli | ^2.0 | MIT OR Apache-2.0 |
| @types/react | ^18.3 | MIT |
| @types/react-dom | ^18.3 | MIT |
| @vitejs/plugin-react | ^4.3 | MIT |
| autoprefixer | ^10.4 | MIT |
| postcss | ^8.4 | MIT |
| tailwindcss | ^3.4 | MIT |
| typescript | ^5.5 | Apache-2.0 |
| vite | ^5.3 | MIT |

---

## 三、独立外部组件（Sidecar）

### dfu-util

- **版本**：0.11+（用户自行安装）
- **许可证**：GPL v2（GNU General Public License version 2）
- **官方网站**：https://dfu-util.sourceforge.net/
- **源代码**：https://git.code.sf.net/p/dfu-util/dfu-util
- **安装方式**：macOS `brew install dfu-util` / Linux `apt install dfu-util` / Windows 下载二进制
- **声明**：dfu-util 是一个独立的命令行工具，本产品通过 fork+exec 方式调用系统 PATH 中的 dfu-util。本仓库不包含 dfu-util 二进制文件。依据 GPL v2 要求，本产品随附 GPL v2 许可证文本（见 `LICENSES/GPL-2.0.txt`）作为参考。
- **版权声明**：Copyright (C) 2007-2008 Weston Schmidt, Harald Welte

---

## 四、随包资源文件

### games-pack（.fap 游戏文件）

> ⚠️ 本仓库不直接包含 .fap 文件，用户通过 `download.sh` 脚本自行下载。

| 文件 | 来源 | 许可证 |
|------|------|--------|
| game_2048.fap | xMasterX/all-the-plugins | GPL-3.0 |
| flipper_pong.fap | xMasterX/all-the-plugins | GPL-3.0 |
| minesweeper_redux.fap | xMasterX/all-the-plugins | GPL-3.0 |
| arkanoid.fap | xMasterX/all-the-plugins | GPL-3.0 |
| asteroids.fap | xMasterX/all-the-plugins | GPL-3.0 |
| flappy_bird.fap | xMasterX/all-the-plugins | GPL-3.0 |

来源仓库：https://github.com/xMasterX/all-the-plugins (GPL-3.0)
应用目录：https://lab.flipper.net/apps

### themes-pack（Asset Pack 主题）

> ⚠️ 本仓库不直接包含主题文件，用户通过 `download.sh` 脚本自行下载。

| 主题 | 来源仓库 | 许可证状态 |
|------|---------|--------|
| Psyduck | https://github.com/naisatoh/Psyduck-Asset-Pack | 无 LICENSE 文件（All Rights Reserved） |
| WatchDogs | https://github.com/WillyJL/Flipper-WatchDogs-AssetPack | 无 LICENSE 文件（All Rights Reserved） |

---

## 五、MIT 许可证文本

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 六、Apache License 2.0 摘要

完整文本见：http://www.apache.org/licenses/LICENSE-2.0

Copyright 占位符由各组件版权人持有。依据 Apache 2.0 第4条，本声明保留所有原始版权声明。

---

## 七、免责声明

本产品按"原样"提供，不附带任何明示或暗示的担保。在各组件许可证允许的范围内，组件版权人不对使用本产品造成的任何损害承担责任。
