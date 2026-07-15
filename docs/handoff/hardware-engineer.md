# 硬件注意事项

画板子之前必读。规格书在 `../prd/lucy-mvp-v1.2.1.html`，这里是补充细节。

## 5 条红线

### 1. NFC 天线

AAT 不是万能的，只能微调几十 pF。匹配网络的焊盘必须全留，按 ST AN5276 来。天线下面要挖净空区，不铺地不走线。电池位置要固定死，它是天线的参考介质。屏蔽罩离天线至少 5mm。

第一版先按 FR-4 介电常数估算贴电容，备几组 0.5pF 步进的换着试。

### 2. TXB0108

这芯片内部串了 4kΩ 电阻，只能跑逻辑信号。UART/SPI/I2C/ADC 没问题，继电器和 LED 条不行。文档和 UI 里要写清楚，不然用户接错来找你麻烦。

### 3. Kill Switch 时序

只切电源不够。SPI 信号线还有 3.3V 的话会通过保护二极管倒灌，闩锁烧芯片。

掉电：先断 SPI（74LVC2G125 OE# 拉高）再断 VCC（TPS22918 关）。
上电：先通 VCC 等 1ms 再通 SPI。

用 RC 实现延迟：R=10kΩ, C=0.1µF, τ≈1ms。开关抖动加个施密特触发器（74LVC1G14）。

CS 脚加 100kΩ 下拉。

### 4. USB 走线

D+/D- 走 Layer 3 内层，上下铺完整 GND。90Ω±10% 差分阻抗，等长 5mil 以内。别跨 GND 裂缝。USB-C 外壳地用 1MΩ + 4.7nF 接 GND，别硬连。

CC1101 屏蔽罩放板子中下部，别靠近 USB-C。中间加 GND 过孔墙，间距 15mm 以内。

### 5. Factory 救砖

Back 键接 GPIO9（非 strapping 脚）。sdkconfig 里开 `CONFIG_BOOTLOADER_FACTORY_RESET`。factory 分区放一个最小 DFU 固件，不需要 UI 不需要射频。

操作方式：按住 Back 插 USB，等 3 秒松开。

## 叠构

4 层板：
- L1 Top：元件 + 信号
- L2：完整 GND
- L3：USB 差分 + 高速信号
- L4 Bottom：信号 + 电池/天线

## BOM 关键料

ESP32-S3-WROOM-1-N8R8 / CC1101RGPR / ST25R3916-AQFT / TXB0108PWR / CH224K / MAX40200 / TPS22918 / 74LVC2G125 / RT9013-33 / TPD4E05U06

都有 LCSC 料号，没 EOL 风险。屏蔽罩需要定制冲压。

## 发板前检查

- [ ] 5 条红线都满足
- [ ] Gerber DRC 过了
- [ ] 天线匹配网络焊盘全留了
- [ ] 屏蔽罩位置在 3D 视图里不冲突
- [ ] UV 丝印彩蛋加了
