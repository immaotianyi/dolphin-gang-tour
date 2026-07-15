# 固件注意事项

规格书在 `../prd/lucy-mvp-v1.2.1.html`，这里写补充。

## 绑核

Core 0 跑 USB 和射频（硬实时），Core 1 跑 UI 和协议解析。别搞混了，UI 渲染不能阻塞 USB 中断。

- Core 0: usb_task(P6), rf_task(P5)
- Core 1: protocol_task(P4), ui_task(P3), input_task(P2), ir_task(P2)

ISR 全部加 IRAM_ATTR。SPI 总线（CC1101/ST25R3916/屏幕共享）用互斥锁。

## 开发顺序

1. USB CDC+HID 复合设备，先跑通 PC 通信
2. 屏幕点亮，SPI DMA 双缓冲
3. CC1101 基础收发
4. ST25R3916 初始化 + AAT 校准
5. 红外 RMT 收发
6. GPIO + 按键
7. MessagePack 协议层
8. LVGL UI 框架

## sdkconfig 要点

开 Factory Reset（GPIO9），开 PSRAM OCT 模式 80MHz，开 TinyUSB CDC+HID。关单核模式。

## 分区表

factory(1.5M) + ota_0(1.5M) + ota_1(1.5M) + nvs + otadata + phy_init + storage。factory 分区的固件只要能跑 USB DFU 就行。

## 协议

USB CDC 传 MessagePack。帧格式：magic(0xAA55) + length + msgpack + CRC16。

请求/响应/事件三种帧。具体字段看规格书 §03。

## 注意

- 日志走 USB CDC，别写 Flash，磨损不起
- NFC AAT 校准每次开机跑一遍，不是只校准一次
- GPIO 上电默认高阻，TXB0108 OE# 默认拉高
- USB 掉了的话 TinyUSB 软复位重新枚举，别硬复位
