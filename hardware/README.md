# Lucy 硬件

## 目录说明

```
hardware/
├── README.md           # 本文件
├── TODO.md             # 开发任务清单
├── docs/
│   ├── design-spec.md  # 硬件设计规格（引脚分配、电源树、叠构、Layout规则）
│   ├── bom.md          # BOM表（含LCSC料号、封装、单价）
│   └── review.md       # 硬件评审记录（痛点分析、改进建议）
├── kicad/              # KiCad工程文件（原理图、PCB、封装库）
│   └── (待创建)
├── gerber/             # 发板Gerber文件（按版本归档）
│   └── (待创建)
└── assets/             # 硬件相关图片（3D渲染、布局截图）
    └── (待创建)
```

## 文档关系

- 产品规格书：`docs/prd/lucy-mvp-v1.2.1.html`
- 硬件交接文档：`docs/handoff/hardware-engineer.md`（5条红线）
- 固件交接文档：`docs/handoff/firmware-engineer.md`
- 本目录是硬件设计的工程文件和补充文档

## 当前进度

- [x] PRD v1.2.1 工程锁定
- [x] 芯片选型、BOM 定版
- [x] 引脚分配方案
- [x] PCB叠构方案（嘉立创JLC7628）
- [ ] 原理图设计
- [ ] PCB Layout
- [ ] 发板打样
- [ ] 回片调试
