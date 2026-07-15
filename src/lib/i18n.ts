/** i18n 国际化初始化 — 支持 zh-CN / en-US，语言切换即时生效 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhCN from "@/locales/zh-CN.json";
import enUS from "@/locales/en-US.json";

export type AppLanguage = "zh-CN" | "en-US";

/** 检测系统语言 */
export function detectSystemLanguage(): AppLanguage {
  const lang = navigator.language || navigator.languages?.[0] || "en";
  return lang.startsWith("zh") ? "zh-CN" : "en-US";
}

/** 从 localStorage 读取已保存的语言 */
export function getSavedLanguage(): AppLanguage {
  const saved = localStorage.getItem("lucy-language");
  if (saved === "zh-CN" || saved === "en-US") return saved;
  return detectSystemLanguage();
}

/** 保存语言选择 */
export function saveLanguage(lang: AppLanguage) {
  localStorage.setItem("lucy-language", lang);
}

i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    "en-US": { translation: enUS },
  },
  lng: getSavedLanguage(),
  fallbackLng: "en-US",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
