# 硬件设计规格

## 1. 引脚分配

ESP32-S3-WROOM-1-N8R8 引脚分配方案。

### Strapping 引脚注意

GPIO0（BOOT）、GPIO3（JTAG）、GPIO45/GPIO46（启动必须低）不能随便接外设。GPIO19/GPIO20固定USB D-/D+。

### 引脚分配表

| GPIO | 功能 | 方向 | 备注 |
|------|------|------|------|
| **USB（固定）** | | | |
| GPIO19 | USB D- | 差分 | 走L3内层，90Ω差分 |
| GPIO20 | USB D+ | 差分 | 走L3内层，90Ω差分 |
| **SPI总线（共享，CS独立）** | | | |
| GPIO11 | SPI_CLK | 输出 | 串22Ω阻尼，包地 |
| GPIO10 | SPI_MOSI | 输出 | 串22Ω阻尼 |
| GPIO12 | SPI_MISO | 输入 | 10kΩ上拉 |
| GPIO13 | CS_ST7789 | 输出 | 屏幕片选，10kΩ上拉 |
| GPIO14 | CS_CC1101 | 输出 | CC1101片选，经74LVC2G125 |
| GPIO15 | CS_ST25R3916 | 输出 | NFC片选，经74LVC2G125 |
| **屏幕控制** | | | |
| GPIO16 | ST7789_DC | 输出 | 数据/命令选择 |
| GPIO17 | ST7789_RST | 输出 | 屏幕复位 |
| GPIO18 | ST7789_BL | 输出 | 背光PWM（经S8050） |
| **CC1101控制** | | | |
| GPIO21 | CC1101_GDO0 | 输入 | 接收中断 |
| GPIO47 | CC1101_GDO2 | 输入 | 预留 |
| **ST25R3916控制** | | | |
| GPIO38 | NFC_IRQ | 输入 | NFC中断 |
| GPIO48 | NFC_EN | 输出 | NFC使能（可选） |
| **红外** | | | |
| GPIO5 | IR_TX | 输出 | RMT驱动，经S8050 |
| GPIO6 | IR_RX | 输入 | TSOP38238输出 |
| **按键** | | | |
| GPIO0 | BOOT | 输入 | 内部上拉 |
| GPIO1 | BTN_UP | 输入 | 内部上拉 |
| GPIO2 | BTN_DOWN | 输入 | 内部上拉 |
| GPIO4 | BTN_LEFT | 输入 | 内部上拉 |
| GPIO7 | BTN_RIGHT | 输入 | 内部上拉 |
| GPIO8 | BTN_OK | 输入 | 内部上拉 |
| GPIO9 | BTN_BACK/FACTORY | 输入 | Factory救砖，100nF消抖 |
| GPIO40 | BTN_ACTION | 输入 | 内部上拉 |
| **GPIO排针（经TXB0108）** | | | |
| GPIO35 | GPIO1 | I/O | ADC1_CH7 |
| GPIO36 | GPIO2 | I/O | ADC1_CH6 |
| GPIO37 | GPIO3 | I/O | UART_TX / I2C_SCL |
| GPIO39 | GPIO4 | I/O | UART_RX / I2C_SDA |
| GPIO41 | GPIO5 | I/O | SPI_CS / 数字 |
| GPIO42 | GPIO6 | I/O | SPI_MOSI / 数字 |
| **其他** | | | |
| GPIO33 | LED_STATUS | 输出 | WS2812B数据 |
| GPIO34 | BUZZER | 输出 | 无源蜂鸣器PWM |
| ADC1_CH9 | VBUS_SENSE | 输入 | VBUS分压检测（4.5V阈值） |
| **SWD调试（预留焊盘）** | | | |
| GPIO39 | SWDIO | I/O | 与GPIO4复用 |
| GPIO40 | SWCLK | 输出 | 与ACTION复用 |
| EN | CHIP_PU | 复位 | EN引脚 |

### 分配原则

- SPI引脚用GPIO10-15（IO_MUX引脚，可达80MHz）
- ADC只用ADC1（GPIO1-10），ADC2与WiFi冲突
- GPIO34-39仅输入，不做输出
- GPIO45/46上电必须低，不接外设

---

## 2. 电源树

```
USB-C 5V (CH224K PD诱骗 1.5A)
    │
    ├── 47µF + 100µF 瞬态缓冲
    │
    ├── MAX40200 理想二极管（20mV压降）
    │   │
    │   ├── 400mAh LiPo（3.7V，缓冲+参考地）
    │   │
    │   └── RT9013-33 LDO #1（数字电源）
    │       └── ESP32-S3 / 屏幕 / 按键 / GPIO
    │
    └── RT9013-33 LDO #2（射频电源，建议新增）
        └── 10µH + 10µF + 0.1µF π滤波
            └── CC1101 / ST25R3916
```

### 电源参数

| 参数 | 值 |
|------|-----|
| USB输入 | 5V/1.5A（CH224K PD诱骗） |
| 电池 | 3.7V 400mAh LiPo，缓冲+参考地 |
| 数字LDO | RT9013-33，500mA，3.3V |
| 射频LDO | RT9013-33，500mA，3.3V（建议新增，隔离数字噪声） |
| 峰值电流 | ~300mA@3.3V（ESP32满载200mA + 屏幕30mA + CC1101 35mA） |
| VBUS监控 | ADC分压检测，<4.5V暂停射频 |

### 去耦规则

- 每个IC的VCC引脚：0.1µF + 10nF + 1nF
- LDO输出端：10µF Bulk电容
- VBUS端：47µF陶瓷 + 100µF钽
- 射频LDO输出：π滤波（10µH + 10µF + 0.1µF）

---

## 3. PCB叠构

嘉立创JLC7628标准4层板叠构：

| 层 | 用途 | 铜厚 | 介质 |
|----|------|------|------|
| L1 Top | 元件 + 低速信号 + 射频匹配 | 1oz (35µm) | PP 7628 (0.2mm) |
| L2 GND | 完整地平面（不分割） | 1oz | Core 1.0mm FR-4 |
| L3 Signal | 电源 + USB差分 + 高速信号 | 1oz | PP 7628 (0.2mm) |
| L4 Bottom | 信号 + 按键 + 天线 | 1oz | - |

总板厚1.6mm。板厂做阻抗控制（加约¥20）。

### USB差分参数

| 参数 | 值 |
|------|-----|
| 走线层 | L3（上下GND，对称带状线） |
| 线宽 | 4.3mil (0.11mm) |
| 线距 | 6mil (0.15mm) |
| 差分阻抗 | 90Ω ±10% |
| 等长误差 | ≤5mil |

### NFC天线净空区

- 线圈正下方L1/L2/L3全部keep-out（不铺铜、不走线）
- 净空范围 = 线圈外径 + 2mm
- 屏蔽罩距天线 ≥5mm
- 天线区域无金属元件

---

## 4. Layout规则

### 线宽/间距

| 类型 | 线宽 | 备注 |
|------|------|------|
| 信号线 | 6mil (0.15mm) | 最小4mil |
| 3.3V电源 | 12-16mil (0.3-0.4mm) | 或铺铜 |
| 5V VBUS | 20mil+ | 或铺铜 |
| 射频信号 | 按50Ω微带线计算 | |
| 线间距 | ≥4mil | 射频区≥6mil |

### 过孔

| 类型 | 内径/外径 |
|------|----------|
| 信号 | 0.3mm / 0.6mm |
| 电源 | 0.4mm / 0.8mm |
| GND | 每个IC旁边≥2个 |
| 屏蔽罩过孔墙 | 间距≤15mil |

### SPI走线

- 星型拓扑：CLK/MOSI从主机T型分支到3个从机
- CLK线两侧包地，每100mil一个GND过孔
- CLK/MOSI串22Ω阻尼电阻（靠近主机）
- MISO加10kΩ上拉
- 每个CS独立，10kΩ上拉

### 布局顺序

1. 机械固定：USB-C → Kill开关 → 红外窗 → GPIO排针 → 屏幕FPC → 电池位 → 屏蔽罩 → 天线区
2. 主控：ESP32-S3居中，下方多打GND过孔
3. 电源：CH224K靠USB-C → MAX40200 → RT9013 → 大电容
4. 射频：CC1101在屏蔽罩内，ST25R3916靠天线匹配网络
5. 其他：按键、LED、ESD器件靠接口

---

## 5. Kill Switch时序

### 掉电顺序

1. 74LVC2G125 OE#拉高 → SPI输出高阻
2. TPS22918关断 → VCC断

### 上电顺序

1. TPS22918导通 → VCC通
2. 等≥1ms（RC: R=10kΩ, C=0.1µF, τ≈1ms）
3. 74LVC2G125 OE#拉低 → SPI输出使能

### 消抖

拨动开关加74LVC1G14施密特触发器消抖。CS引脚加100kΩ下拉。

---

## 6. NFC天线

### 线圈参数

| 参数 | 值 |
|------|-----|
| 谐振频率 | 13.56MHz |
| 目标电感 | 0.9-1.2µH |
| Q值 | 20-30 |
| 线圈尺寸 | ~25×35mm（根据PCB空间调） |
| 圈数 | 4-6圈（L4层） |
| 线宽 | 0.5-1mm |
| 线间距 | 0.3-0.5mm |

### 匹配网络

按ST AN5276应用手册：

```
ST25R3916 RFOUT ──[L0=270nH]──[C0]──┬─── 天线线圈 ─── GND
                                      │
                                 [C1] (并联可调)
                                      │
                                 [C2] (并联可调)
                                      │
                                     GND
```

C0/C1/C2位置各留3-4个并联0402焊盘，备0.5pF步进电容调谐。

### 调试工具

- NanoVNA V2：测天线S11阻抗
- 电容包：1pF-33pF C0G，0.5pF步进
- NFC标签样本：Mifare Classic 1K、FeliCa、ISO14443B

---

## 7. 原理图Checklist

- [ ] ESP32-S3：EN上拉10kΩ + 0.1µF，GPIO0 BOOT按键+上拉，VCC去耦，散热焊盘GND过孔
- [ ] 电源：CC下拉5.1kΩ，CH224K CFG1/CFG2配5V，VBUS大电容，MAX40200正确连接，射频LDO独立+π滤波
- [ ] Kill Switch：RC时序（先断信号后断电，先通电后通信号），74LVC1G14消抖，CS下拉100kΩ
- [ ] CC1101：26MHz晶振，射频LDO+π滤波，GDO0上拉，SPI经74LVC2G125，屏蔽罩GND过孔
- [ ] ST25R3916：27.12MHz晶振（不是26MHz！），EMI滤波，匹配网络多焊盘，IRQ上拉，天线净空标注
- [ ] USB：共模扼流圈，TVS，CC脚ESD，外壳地1MΩ+4.7nF
- [ ] TXB0108：VCCA=3.3V，VCCB可选，OE控制，每路串100Ω+TVS，3.3V输出串PTC+LED
- [ ] 红外：IR LED经S8050驱动，TSOP38238去耦+金属壳接地
- [ ] 屏幕：SPI阻尼电阻，CS/DC/RST/BL上拉，背光NPN驱动
- [ ] 其他：按键上拉，Back键100nF消抖，SWD焊盘，VBUS分压检测，UV丝印彩蛋
