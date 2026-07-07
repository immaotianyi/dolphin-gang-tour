import React, { useState } from "react";

/**
 * 用户协议与免责声明
 * 首次启动时展示，用户必须同意才能使用
 * 同意状态存储在 localStorage: "dolphin-gang-tour-agreed"
 */
export const UserAgreement: React.FC<{ onAgree: () => void }> = ({ onAgree }) => {
  const [tab, setTab] = useState<"agreement" | "privacy">("agreement");

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "rgba(0,0,0,0.9)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div className="pixel-border-orange" style={{
        width: "min(640px, 94vw)", maxHeight: "90vh", overflow: "hidden",
        background: "var(--c-dark2)", display: "flex", flexDirection: "column",
      }}>
        {/* 标题 */}
        <div style={{ textAlign: "center", padding: "16px 20px 8px" }}>
          <div className="font-pixel text-orange" style={{ fontSize: 12, letterSpacing: 2 }}>
            DOLPHIN GANG TOUR
          </div>
          <div className="font-term text-dim" style={{ fontSize: 14, marginTop: 4 }}>
            用户协议与隐私政策
          </div>
        </div>

        {/* Tab 切换 */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--c-gray)" }}>
          <button
            className="font-term"
            style={{
              flex: 1, padding: "8px", fontSize: 13,
              color: tab === "agreement" ? "var(--c-orange)" : "var(--c-dim)",
              borderBottom: tab === "agreement" ? "2px solid var(--c-orange)" : "none",
              background: "transparent", border: "none", cursor: "pointer",
            }}
            onClick={() => setTab("agreement")}
          >
            用户协议
          </button>
          <button
            className="font-term"
            style={{
              flex: 1, padding: "8px", fontSize: 13,
              color: tab === "privacy" ? "var(--c-orange)" : "var(--c-dim)",
              borderBottom: tab === "privacy" ? "2px solid var(--c-orange)" : "none",
              background: "transparent", border: "none", cursor: "pointer",
            }}
            onClick={() => setTab("privacy")}
          >
            隐私政策
          </button>
        </div>

        {/* 内容区 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {tab === "agreement" ? <AgreementContent /> : <PrivacyContent />}
        </div>

        {/* 底部按钮 */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--c-gray)", display: "flex", gap: 8 }}>
          <button
            className="font-term"
            style={{
              flex: 1, padding: "10px", fontSize: 13,
              background: "transparent", color: "var(--c-dim)",
              border: "1px solid var(--c-gray)", cursor: "pointer",
            }}
            onClick={() => {
              // 用户拒绝，关闭应用
              window.close();
            }}
          >
            拒绝并退出
          </button>
          <button
            className="font-term"
            style={{
              flex: 2, padding: "10px", fontSize: 13,
              background: "var(--c-orange)", color: "#000",
              border: "none", cursor: "pointer", fontWeight: "bold",
            }}
            onClick={() => {
              localStorage.setItem("dolphin-gang-tour-agreed", "true");
              localStorage.setItem("dolphin-gang-tour-agreed-date", new Date().toISOString());
              onAgree();
            }}
          >
            我已阅读并同意
          </button>
        </div>
      </div>
    </div>
  );
};

/** 用户协议内容 */
const AgreementContent: React.FC = () => (
  <div className="font-term" style={{ fontSize: 13, lineHeight: 1.8, color: "var(--c-text)" }}>
    <p style={{ color: "var(--c-orange)", fontWeight: "bold", marginBottom: 8 }}>⚠️ 重要声明</p>
    <p style={{ marginBottom: 12 }}>本产品 Dolphin Gang Tour 是一款独立开发的桌面工具软件，<strong style={{color:"var(--c-orange)"}}>非 Flipper Devices Inc. 官方产品</strong>，与 Flipper Devices Inc. 无任何关联、赞助或合作关系。"Flipper Zero" 是 Flipper Devices Inc. 的注册商标，本产品仅在描述兼容性时进行指示性使用。</p>

    <p style={{ color: "var(--c-orange)", fontWeight: "bold", marginTop: 16, marginBottom: 8 }}>一、用途限定</p>
    <p>本产品仅供以下合法用途使用：</p>
    <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
      <li>授权的安全研究与渗透测试</li>
      <li>硬件学习与电子工程教育</li>
      <li>个人自有设备的调试与管理</li>
      <li>网络安全防护能力的学术研究</li>
    </ul>
    <p style={{ marginTop: 8 }}><strong style={{color:"#ff4444"}}>严禁</strong>将本产品用于任何未经授权的访问、入侵、破坏或干扰他人计算机信息系统、通信系统、物理门禁系统的行为。</p>

    <p style={{ color: "var(--c-orange)", fontWeight: "bold", marginTop: 16, marginBottom: 8 }}>二、用户责任</p>
    <p>用户应遵守所在地法律法规，对使用本产品的行为独立承担全部法律责任。包括但不限于：</p>
    <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
      <li>《中华人民共和国刑法》第285条（非法侵入计算机信息系统罪）</li>
      <li>《中华人民共和国无线电管理条例》第70条/73条</li>
      <li>《中华人民共和国个人信息保护法》</li>
      <li>《计算机信息网络国际联网安全保护管理办法》</li>
      <li>所在国家/地区的网络安全与无线电管理相关法律</li>
    </ul>

    <p style={{ color: "var(--c-orange)", fontWeight: "bold", marginTop: 16, marginBottom: 8 }}>三、功能使用限制</p>
    <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
      <li><strong>SubGHz 信号</strong>：不得擅自更改发射频率、加大功率或在非授权频段使用</li>
      <li><strong>NFC/RFID</strong>：仅限读取/复制本人合法持有的卡片，复制他人门禁卡可能构成犯罪</li>
      <li><strong>BadUSB</strong>：仅限在自有设备上测试，禁止对他人计算机实施未授权操作</li>
      <li><strong>第三方固件</strong>：刷写解除频段锁定的第三方固件可能违反当地法律</li>
    </ul>

    <p style={{ color: "var(--c-orange)", fontWeight: "bold", marginTop: 16, marginBottom: 8 }}>四、AI 生成内容</p>
    <p>本产品的 AI 辅导功能由第三方 AI 服务（如 OpenAI、Anthropic 等）提供，AI 生成的回复内容仅供参考，不构成专业建议。用户应对 AI 生成内容的准确性和适用性自行判断。</p>

    <p style={{ color: "var(--c-orange)", fontWeight: "bold", marginTop: 16, marginBottom: 8 }}>五、免责声明</p>
    <p>在法律允许的范围内，开发者不对因使用或无法使用本产品而导致的任何直接、间接、附带或后果性损害承担责任。开发者不对用户违法使用本产品的行为承担连带责任。</p>

    <p style={{ color: "var(--c-orange)", fontWeight: "bold", marginTop: 16, marginBottom: 8 }}>六、未成年人限制</p>
    <p>本产品建议在成人指导下使用。未成年人应在监护人陪同下阅读本协议并使用本产品。</p>

    <p style={{ color: "var(--c-dim)", fontSize: 12, marginTop: 20, textAlign: "center" }}>
      最后更新：2026年7月7日 · Dolphin Gang Tour
    </p>
  </div>
);

/** 隐私政策内容 */
const PrivacyContent: React.FC = () => (
  <div className="font-term" style={{ fontSize: 13, lineHeight: 1.8, color: "var(--c-text)" }}>
    <p style={{ color: "var(--c-orange)", fontWeight: "bold", marginBottom: 8 }}>隐私政策</p>
    <p>本政策说明 Dolphin Gang Tour 如何收集、使用、存储和传输您的数据。</p>

    <p style={{ color: "var(--c-orange)", fontWeight: "bold", marginTop: 16, marginBottom: 8 }}>一、数据收集</p>
    <p>本产品在本地运行，<strong>不主动收集您的个人信息</strong>。以下数据仅在本地存储和处理：</p>
    <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
      <li><strong>API Key</strong>：使用系统钥匙串（macOS Keychain / Windows Credential Manager）加密存储，不以明文形式保存</li>
      <li><strong>设备信息</strong>：Flipper Zero 设备 UID、序列号等，仅在本地显示，不上传任何服务器</li>
      <li><strong>NFC/RFID 数据</strong>：卡片数据仅在本地处理，不通过网络传输</li>
      <li><strong>AI 对话记录</strong>：对话内容通过第三方 AI API 处理（见下文"数据传输"）</li>
      <li><strong>成就/桌宠数据</strong>：存储在本地配置文件和 localStorage 中</li>
    </ul>

    <p style={{ color: "var(--c-orange)", fontWeight: "bold", marginTop: 16, marginBottom: 8 }}>二、数据传输</p>
    <p>以下数据会通过网络传输至第三方服务：</p>
    <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
      <li><strong>AI 对话内容</strong>：发送至您配置的 AI 服务提供商（OpenAI / Anthropic / Google / DeepSeek）。传输内容由 AI 服务商的隐私政策管辖</li>
      <li><strong>OCR 截图</strong>：如使用 AI 图片分析功能，截图将发送至 AI 服务商。发送前已进行敏感信息脱敏处理（7种模式）</li>
      <li><strong>固件列表</strong>：从 GitHub API 获取最新固件信息，请求中不包含个人数据</li>
    </ul>
    <p style={{ marginTop: 8 }}><strong style={{color:"#ff4444"}}>注意</strong>：AI 服务商可能记录您的对话内容。请勿在对话中输入敏感个人信息。</p>

    <p style={{ color: "var(--c-orange)", fontWeight: "bold", marginTop: 16, marginBottom: 8 }}>三、数据安全</p>
    <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
      <li>API Key 使用系统级加密存储（keyring）</li>
      <li>AI 脱敏器在发送前过滤 7+ 种敏感模式（UID/NFC Key/WiFi密码/API Key/手机号/邮箱/坐标）</li>
      <li>配置文件使用 0600 权限（仅所有者可读写）</li>
      <li>所有网络连接强制 HTTPS</li>
      <li>自定义 API URL 经过 SSRF 防护（禁止内网/云元数据地址）</li>
    </ul>

    <p style={{ color: "var(--c-orange)", fontWeight: "bold", marginTop: 16, marginBottom: 8 }}>四、敏感数据处理</p>
    <p>NFC 门禁卡数据、RFID 卡片数据可能属于<strong>敏感个人信息</strong>（行踪轨迹）。本产品承诺：</p>
    <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
      <li>仅在本地处理，绝不上传任何服务器</li>
      <li>处理前会向您提示数据敏感性</li>
      <li>您有权随时删除本地存储的所有数据</li>
    </ul>

    <p style={{ color: "var(--c-orange)", fontWeight: "bold", marginTop: 16, marginBottom: 8 }}>五、第三方组件</p>
    <p>本产品使用了开源软件组件（Tauri、React、Rust 等），完整清单见 THIRDPARTY.md。这些组件的隐私政策由各自项目管辖。</p>

    <p style={{ color: "var(--c-orange)", fontWeight: "bold", marginTop: 16, marginBottom: 8 }}>六、您的权利</p>
    <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
      <li>查看权：您可在设置中查看本地存储的所有配置数据</li>
      <li>删除权：您可随时通过卸载应用或删除配置目录清除所有数据</li>
      <li>撤回授权权：您可随时清除 API Key 停止 AI 数据传输</li>
    </ul>

    <p style={{ color: "var(--c-dim)", fontSize: 12, marginTop: 20, textAlign: "center" }}>
      最后更新：2026年7月7日 · Dolphin Gang Tour
    </p>
  </div>
);

export default UserAgreement;
