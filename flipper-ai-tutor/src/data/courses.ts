/**
 * 预置课程数据 — 分步学习指导
 */
import type { Course } from "@/types";

export const COURSES: Course[] = [
  {
    id: "course-00",
    title: "认识你的 Flipper",
    description: "按键说明、主界面导航、充电开关机 — 5分钟上手",
    durationMin: 5,
    icon: "dolphin",
    steps: [
      "拿起Flipper，观察正面十字方向键（上下左右）、中间OK键、背面BACK键",
      "按OK键点亮屏幕，告诉我你看到了什么",
      "用方向键浏览主菜单，了解NFC/RFID/红外/Sub-GHz等入口",
      "学习如何充电（USB-C）和开关机（长按BACK）",
    ],
  },
  {
    id: "course-01",
    title: "复制门禁卡（ID卡）",
    description: "读125kHz RFID卡 → 保存 → 模拟 → 验证开门",
    durationMin: 10,
    icon: "card",
    steps: [
      "拍一张门禁卡照片发给助手识别类型",
      "进入 125kHz RFID → Read",
      "把卡贴在Flipper背面读取",
      "保存卡数据并命名",
      "使用 Saved 模拟卡片",
      "去门禁机上测试",
    ],
  },
  {
    id: "course-02",
    title: "复制IC卡（Mifare进阶）",
    description: "默认密钥检测 → 嵌套攻击 → 嗅探 → 写UID卡",
    durationMin: 15,
    icon: "nfc",
    steps: [
      "进入 NFC → Read，检测卡类型和扇区",
      "尝试默认密钥读取",
      "如果加密，学习嵌套攻击原理",
      "写入UID卡（需要单独购买UID卡）",
      "安全注意事项讲解",
    ],
  },
  {
    id: "course-03",
    title: "变身万能遥控器",
    description: "红外学习 → 码库添加 → 遥控电视空调",
    durationMin: 10,
    icon: "tv",
    steps: [
      "进入 Infrared → Universal Remotes",
      "选择设备类型（电视/空调/投影仪）",
      "从红外库选择品牌",
      "测试遥控按键",
      "学习现有遥控器信号（可选）",
    ],
  },
  {
    id: "course-04",
    title: "捕捉无线信号",
    description: "Sub-GHz扫频 → 保存 → 重放 → 滚动码科普",
    durationMin: 15,
    icon: "subghz",
    steps: [
      "进入 Sub-GHz → Read",
      "扫频找出信号频率",
      "按遥控器捕获信号",
      "保存信号并命名",
      "使用 Saved 重放信号",
      "滚动码原理科普与合法使用提醒",
    ],
  },
  {
    id: "course-05",
    title: "BadUSB 演示",
    description: "原理讲解 → 运行示例 → 写脚本 → 安全警告",
    durationMin: 10,
    icon: "badusb",
    steps: [
      "BadUSB原理讲解（模拟键盘注入）",
      "运行Rickroll无害演示脚本",
      "学习简单DuckyScript语法",
      "自己写一个打开记事本的脚本",
      "安全警告与法律责任讲解",
    ],
  },
  {
    id: "course-06",
    title: "安装更多应用",
    description: "Flipper Lab → 推荐应用 → 删除管理",
    durationMin: 5,
    icon: "package",
    steps: [
      "进入 Apps → App Manager",
      "连接WiFi或通过电脑安装",
      "浏览推荐应用列表",
      "安装一个计算器或游戏",
      "学习如何删除应用",
    ],
  },
];

export const getCourseById = (id: string): Course | undefined =>
  COURSES.find((c) => c.id === id);
