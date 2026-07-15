/** Virtual Lab 虚拟实验室 — 5门教学课程 + AI教练面板 */
import React, { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui/Icon";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { showToast } from "@/components/ui/Toast";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";
import { createNfcFlow, createSubghzFlow, createIrFlow, createBadusbFlow, createFirmwareFlow } from "@/stores/taskStore";
import type { IconName } from "@/types";

interface Course {
  id: string;
  icon: IconName;
  color: string;
  lessons: { id: string; titleKey: string }[];
}

const COURSES: Course[] = [
  {
    id: "nfc",
    icon: "nfc",
    color: "var(--c-cyan)",
    lessons: [
      { id: "nfc_basics", titleKey: "virtual.lessons.nfc_basics" },
      { id: "nfc_read", titleKey: "virtual.lessons.nfc_read" },
      { id: "nfc_emulate", titleKey: "virtual.lessons.nfc_emulate" },
    ],
  },
  {
    id: "subghz",
    icon: "radio",
    color: "var(--c-orange)",
    lessons: [
      { id: "subghz_scan", titleKey: "virtual.lessons.subghz_scan" },
      { id: "subghz_capture", titleKey: "virtual.lessons.subghz_capture" },
      { id: "subghz_protocol", titleKey: "virtual.lessons.subghz_protocol" },
    ],
  },
  {
    id: "ir",
    icon: "ir",
    color: "var(--c-green)",
    lessons: [
      { id: "ir_learn", titleKey: "virtual.lessons.ir_learn" },
      { id: "ir_transmit", titleKey: "virtual.lessons.ir_transmit" },
    ],
  },
  {
    id: "badusb",
    icon: "keyboard",
    color: "var(--c-red)",
    lessons: [
      { id: "badusb_edit", titleKey: "virtual.lessons.badusb_edit" },
      { id: "badusb_validate", titleKey: "virtual.lessons.badusb_validate" },
      { id: "badusb_execute", titleKey: "virtual.lessons.badusb_execute" },
    ],
  },
  {
    id: "firmware",
    icon: "rocket",
    color: "var(--c-yellow)",
    lessons: [
      { id: "fw_check", titleKey: "virtual.lessons.fw_check" },
      { id: "fw_flash", titleKey: "virtual.lessons.fw_flash" },
    ],
  },
];

const TIPS = ["virtual.tips.tip1", "virtual.tips.tip2", "virtual.tips.tip3", "virtual.tips.tip4"];

export const VirtualLabModule: React.FC = () => {
  const { t } = useTranslation();
  const { startFlow } = useTaskStore();
  const { setView, addTimelineEntry } = useUiStore();
  const [activeCourse, setActiveCourse] = useState<string | null>(null);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(() => {
    // Load from localStorage on init
    try {
      const saved = localStorage.getItem("virtualLab_progress");
      if (saved) return new Set(JSON.parse(saved));
    } catch { /* ignore */ }
    return new Set();
  });
  const [tipIndex, setTipIndex] = useState(0);

  // Persist to localStorage whenever completedLessons changes
  useEffect(() => {
    try {
      localStorage.setItem("virtualLab_progress", JSON.stringify([...completedLessons]));
    } catch { /* ignore */ }
  }, [completedLessons]);

  const handleStartCourse = useCallback((course: Course) => {
    setActiveCourse(course.id);
    showToast("info", t("virtual.startCourse") + ": " + t(`virtual.course${COURSES.indexOf(course) + 1}`));
  }, [t]);

  const handleStartLesson = useCallback((course: Course, lessonId: string, lessonKey: string) => {
    // Launch corresponding task flow
    if (course.id === "nfc") {
      const flow = createNfcFlow();
      startFlow(flow.module, flow.title, flow.steps);
    } else if (course.id === "subghz") {
      const flow = createSubghzFlow();
      startFlow(flow.module, flow.title, flow.steps);
    } else if (course.id === "ir") {
      const flow = createIrFlow();
      startFlow(flow.module, flow.title, flow.steps);
    } else if (course.id === "badusb") {
      const flow = createBadusbFlow();
      startFlow(flow.module, flow.title, flow.steps);
    } else if (course.id === "firmware") {
      const flow = createFirmwareFlow();
      startFlow(flow.module, flow.title, flow.steps);
    }

    // Navigate to the module
    setView(course.id as Parameters<typeof setView>[0]);

    // Mark lesson as completed
    setCompletedLessons((prev) => new Set(prev).add(lessonId));

    // Record in timeline
    addTimelineEntry({
      type: "info",
      message: t(lessonKey),
      detail: t("virtual.simulated"),
    });

    showToast("success", t(lessonKey));
  }, [t, startFlow, setView, addTimelineEntry]);

  const handleCompleteCourse = useCallback((course: Course) => {
    const allLessons = course.lessons.map((l) => l.id);
    const allDone = allLessons.every((id) => completedLessons.has(id));
    if (allDone) {
      showToast("success", t("virtual.completeCourse") + ": " + t(`virtual.course${COURSES.indexOf(course) + 1}`));
      addTimelineEntry({
        type: "info",
        message: t("virtual.completeCourse") + ": " + t(`virtual.course${COURSES.indexOf(course) + 1}`),
        detail: t("virtual.simulated"),
      });
    } else {
      showToast("warn", t("virtual.courseProgress") + ": " + completedLessons.size + "/" + allLessons.length);
    }
  }, [t, completedLessons, addTimelineEntry]);

  const totalLessons = COURSES.reduce((sum, c) => sum + c.lessons.length, 0);
  const progress = Math.round((completedLessons.size / totalLessons) * 100);

  return (
    <div style={{ padding: "1rem", overflowY: "auto", height: "100%" }}>
      {/* Header */}
      <PixelPanel style={{ padding: "1rem", marginBottom: "0.8rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
          <div style={{
            width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(34,211,238,0.1)", border: "2px solid var(--c-cyan)",
          }}>
            <Icon name="flask" size={28} style={{ color: "var(--c-cyan)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 className="font-pixel text-ink" style={{ fontSize: "1rem", letterSpacing: "0.05em" }}>
              {t("virtual.title")}
            </h2>
            <p className="font-term text-dim" style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>
              {t("virtual.subtitle")}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="font-pixel text-orange" style={{ fontSize: "1.2rem" }}>{progress}%</div>
            <div className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>{t("virtual.courseProgress")}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: "0.6rem", height: 6, background: "var(--c-bg3)", border: "1px solid var(--c-rule)" }}>
          <div style={{
            height: "100%",
            width: `${progress}%`,
            background: "var(--c-cyan)",
            transition: "width 0.4s var(--ease-apple)",
          }} />
        </div>

        {/* Notice */}
        <div style={{
          marginTop: "0.6rem", padding: "0.4rem 0.6rem",
          background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.3)",
        }}>
          <span className="font-term text-dim" style={{ fontSize: "0.72rem" }}>
            <Icon name="info" size={12} style={{ marginRight: 4, color: "var(--c-cyan)" }} />
            {t("virtual.virtualModeNotice")}
          </span>
        </div>
      </PixelPanel>

      {/* Course grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: "0.8rem", marginBottom: "0.8rem",
      }}>
        {COURSES.map((course, idx) => {
          const courseProgress = course.lessons.filter((l) => completedLessons.has(l.id)).length;
          const isExpanded = activeCourse === course.id;
          const allDone = courseProgress === course.lessons.length;

          return (
            <PixelPanel key={course.id} style={{ padding: 0, overflow: "hidden" }}>
              {/* Course header */}
              <button
                onClick={() => handleStartCourse(course)}
                style={{
                  width: "100%", padding: "0.8rem", display: "flex", alignItems: "center", gap: "0.6rem",
                  background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{
                  width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                  background: `${course.color}15`, border: `2px solid ${course.color}`,
                }}>
                  <Icon name={course.icon} size={20} style={{ color: course.color }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="font-pixel text-ink" style={{ fontSize: "0.75rem" }}>
                    {t(`virtual.course${idx + 1}`)}
                  </div>
                  <div className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>
                    {courseProgress}/{course.lessons.length} {t("virtual.lessons.nfc_basics").split(":")[0] ? "lessons" : ""}
                  </div>
                </div>
                {allDone && <Icon name="check" size={16} style={{ color: "var(--c-green)" }} />}
                <Icon name={isExpanded ? "chevron-up" : "chevron-down"} size={14} style={{ color: "var(--c-muted)" }} />
              </button>

              {/* Course progress bar */}
              <div style={{ height: 3, background: "var(--c-bg3)" }}>
                <div style={{
                  height: "100%",
                  width: `${(courseProgress / course.lessons.length) * 100}%`,
                  background: course.color,
                  transition: "width 0.3s var(--ease-apple)",
                }} />
              </div>

              {/* Lessons */}
              {isExpanded && (
                <div style={{ padding: "0.4rem 0.6rem 0.6rem" }}>
                  {course.lessons.map((lesson) => {
                    const isDone = completedLessons.has(lesson.id);
                    return (
                      <div key={lesson.id} style={{
                        display: "flex", alignItems: "center", gap: "0.5rem",
                        padding: "0.4rem 0.3rem", borderBottom: "1px solid var(--c-rule)",
                      }}>
                        <div style={{
                          width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                          border: `1px solid ${isDone ? "var(--c-green)" : "var(--c-rule)"}`,
                          background: isDone ? "rgba(74,222,128,0.1)" : "transparent",
                        }}>
                          {isDone && <Icon name="check" size={12} style={{ color: "var(--c-green)" }} />}
                        </div>
                        <span className="font-term text-dim" style={{ flex: 1, fontSize: "0.75rem" }}>
                          {t(lesson.titleKey)}
                        </span>
                        <PixelButton
                          variant="ghost"
                          onClick={() => handleStartLesson(course, lesson.id, lesson.titleKey)}
                          style={{ padding: "0.2rem 0.4rem" }}
                        >
                          <Icon name="play" size={12} />
                        </PixelButton>
                      </div>
                    );
                  })}
                  <div style={{ marginTop: "0.4rem", display: "flex", gap: "0.4rem" }}>
                    <PixelButton
                      variant="primary"
                      onClick={() => handleCompleteCourse(course)}
                      style={{ flex: 1, padding: "0.3rem 0.5rem" }}
                    >
                      {t("virtual.completeCourse")}
                    </PixelButton>
                  </div>
                </div>
              )}
            </PixelPanel>
          );
        })}
      </div>

      {/* AI Coach Panel */}
      <PixelPanel style={{ padding: "0.8rem", marginBottom: "0.8rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <Icon name="robot" size={18} style={{ color: "var(--c-orange)" }} />
          <span className="font-pixel text-orange" style={{ fontSize: "0.7rem", letterSpacing: "0.05em" }}>
            {t("ai.title")} Coach
          </span>
        </div>
        <div style={{
          padding: "0.6rem", background: "rgba(249,115,22,0.06)",
          border: "1px solid rgba(249,115,22,0.2)",
        }}>
          <p className="font-term text-dim" style={{ fontSize: "0.75rem", lineHeight: 1.6 }}>
            {t(TIPS[tipIndex])}
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {TIPS.map((_, i) => (
                <div key={i} style={{
                  width: 6, height: 6,
                  background: i === tipIndex ? "var(--c-orange)" : "var(--c-rule)",
                  cursor: "pointer",
                }} onClick={() => setTipIndex(i)} />
              ))}
            </div>
            <PixelButton variant="ghost" onClick={() => setTipIndex((tipIndex + 1) % TIPS.length)} style={{ padding: "0.2rem 0.4rem" }}>
              <Icon name="refresh" size={12} />
            </PixelButton>
          </div>
        </div>
      </PixelPanel>

      {/* Quick stats */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem",
      }}>
        <PixelPanel style={{ padding: "0.6rem", textAlign: "center" }}>
          <div className="font-pixel text-cyan" style={{ fontSize: "1.1rem" }}>{COURSES.length}</div>
          <div className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>{t("virtual.title")}</div>
        </PixelPanel>
        <PixelPanel style={{ padding: "0.6rem", textAlign: "center" }}>
          <div className="font-pixel text-green" style={{ fontSize: "1.1rem" }}>{completedLessons.size}/{totalLessons}</div>
          <div className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>{t("virtual.courseProgress")}</div>
        </PixelPanel>
        <PixelPanel style={{ padding: "0.6rem", textAlign: "center" }}>
          <div className="font-pixel text-orange" style={{ fontSize: "1.1rem" }}>{progress}%</div>
          <div className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>Complete</div>
        </PixelPanel>
      </div>
    </div>
  );
};
