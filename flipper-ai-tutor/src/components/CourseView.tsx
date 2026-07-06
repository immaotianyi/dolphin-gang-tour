/**
 * 课程学习视图（主视图）
 * - 课程标题 + 图标 + 时长
 * - 步骤列表（带进度勾选框）
 * - "开始学习" 按钮（启动 AI 对话模式进入课程）
 */
import React from "react";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { useUiStore } from "@/stores/uiStore";
import { useChatStore } from "@/stores/chatStore";
import { COURSES, getCourseById } from "@/data/courses";

export const CourseView: React.FC = () => {
  const { activeCourseId, openCourse, setView, toggleStep, isStepDone } =
    useUiStore();
  const { pushAssistant, send } = useChatStore();

  const course = activeCourseId ? getCourseById(activeCourseId) : undefined;

  // 没有选中课程时，展示课程目录
  if (!course) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
        <div className="term-titlebar" style={{ flexShrink: 0 }}>
          <Icon name="book" size={18} />
          <span className="font-pixel" style={{ fontSize: 10, color: "var(--c-white)" }}>
            COURSE CATALOG
          </span>
        </div>
        <div className="scroll-y" style={{ flex: 1, padding: 14, minHeight: 0 }}>
          <div className="font-term text-dim" style={{ fontSize: 17, marginBottom: 12 }}>
            从左侧选择一门课程，或在下方挑一个开始：
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {COURSES.map((c, i) => (
              <div
                key={c.id}
                className="fw-card"
                onClick={() => openCourse(c.id)}
                style={{ cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="menu-num" style={{ color: "var(--c-yellow)" }}>
                    {String(i).padStart(2, "0")}
                  </span>
                  <Icon name={c.icon as IconName} size={20} />
                  <span className="font-pixel text-orange" style={{ fontSize: 9 }}>
                    {c.title}
                  </span>
                  <span className="badge badge-new">{c.durationMin} 分钟</span>
                </div>
                <div className="font-term text-dim" style={{ fontSize: 15, marginTop: 4 }}>
                  {c.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const doneCount = course.steps.filter((_, idx) =>
    isStepDone(course.id, idx),
  ).length;
  const pct = Math.round((doneCount / course.steps.length) * 100);

  /** 开始学习：把课程首步推送到 AI 对话并切换视图 */
  const handleStart = () => {
    const intro =
      `开始课程「${course.title}」（约 ${course.durationMin} 分钟）。\n` +
      course.steps
        .map((s, i) => `${i + 1}. ${s}`)
        .join("\n") +
      `\n\n我们先从第 1 步开始：${course.steps[0]}\n准备好后告诉我，或发截图让我看你的屏幕。`;
    pushAssistant(intro);
    setView("ai");
  };

  /** 继续：直接进入 AI 对话 */
  const handleContinue = () => {
    send(`继续课程「${course.title}」，下一步该怎么做？`);
    setView("ai");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 标题栏 */}
      <div className="term-titlebar" style={{ flexShrink: 0 }}>
        <span className="term-dot red" />
        <span className="term-dot yellow" />
        <span className="term-dot green" />
        <Icon name="book" size={18} />
        <span className="font-pixel" style={{ fontSize: 10, color: "var(--c-white)" }}>
          COURSE
        </span>
      </div>

      <div className="scroll-y" style={{ flex: 1, padding: 14, minHeight: 0 }}>
        {/* 课程头部 */}
        <div
          className="term-card"
          style={{ margin: 0, marginBottom: 14, padding: 0 }}
        >
          <div className="term-titlebar" style={{ borderBottom: "2px solid var(--c-white)" }}>
            <Icon name={course.icon as IconName} size={20} />
            <span className="font-pixel text-orange" style={{ fontSize: 11 }}>
              {course.title}
            </span>
            <span className="badge badge-new" style={{ marginLeft: "auto" }}>
              {course.durationMin} MIN
            </span>
          </div>
          <div style={{ padding: "10px 14px" }}>
            <div className="font-term text-green" style={{ fontSize: 17 }}>
              {course.description}
            </div>
            <div style={{ marginTop: 10 }}>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div
                className="font-mono"
                style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}
              >
                <span className="text-green">
                  进度 {doneCount}/{course.steps.length}
                </span>
                <span className="text-orange">{pct}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 步骤列表 */}
        <div className="font-pixel text-orange" style={{ fontSize: 8, marginBottom: 6 }}>
          STEPS
        </div>
        <div style={{ borderTop: "1px solid var(--c-gray)" }}>
          {course.steps.map((step, idx) => {
            const done = isStepDone(course.id, idx);
            return (
              <div
                key={idx}
                className={`course-step ${done ? "done" : ""}`}
                onClick={() => toggleStep(course.id, idx)}
              >
                <span className="step-box">
                  {done && <Icon name="check" size={16} />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="font-mono text-yellow" style={{ fontSize: 12 }}>
                    STEP {String(idx + 1).padStart(2, "0")}
                  </div>
                  <div
                    className="font-term"
                    style={{ fontSize: 17, color: done ? "var(--c-green)" : "var(--c-white)" }}
                  >
                    {step}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 操作按钮 */}
        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={handleStart}>
            <Icon name="play" size={16} />
            开始学习
          </button>
          <button className="btn" onClick={handleContinue}>
            <Icon name="terminal" size={16} />
            继续问 AI
          </button>
          <button className="btn" onClick={() => setView("ai")}>
            <Icon name="chevron-right" size={16} />
            返回对话
          </button>
        </div>
      </div>
    </div>
  );
};

export default CourseView;
