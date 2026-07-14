/** 任务流状态管理 — TaskFlow Engine */
import { create } from "zustand";
import type { TaskFlow, TaskStep, TaskFlowModule, RiskLevel } from "@/types";

interface TaskStore {
  activeFlow: TaskFlow | null;
  flowHistory: TaskFlow[];

  startFlow: (module: TaskFlowModule, title: string, steps: TaskStep[]) => void;
  advanceStep: (resultData?: Record<string, unknown>) => void;
  skipStep: () => void;
  cancelFlow: () => void;
  completeFlow: (assetId?: string) => void;
  resetFlow: () => void;
  errorStep: (errorMessage: string) => void;
  retryStep: () => void;
  resumeFlow: () => void;
}

const DEFAULT_RISK: Record<TaskFlowModule, RiskLevel> = {
  nfc: "safe",
  subghz: "caution",
  ir: "safe",
  badusb: "dangerous",
  firmware: "dangerous",
};

export const useTaskStore = create<TaskStore>((set, get) => ({
  activeFlow: null,
  flowHistory: [],

  startFlow: (module, title, steps) => {
    const flow: TaskFlow = {
      id: `flow-${Date.now()}`,
      title,
      module,
      steps: steps.map((s, i) => ({ ...s, status: i === 0 ? "active" : "pending" })),
      currentStep: 0,
      riskLevel: DEFAULT_RISK[module] || "caution",
      canPause: true,
      canResume: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set({ activeFlow: flow });
  },

  advanceStep: (resultData) => {
    const flow = get().activeFlow;
    if (!flow) return;
    const steps = [...flow.steps];
    steps[flow.currentStep] = {
      ...steps[flow.currentStep],
      status: "done",
      resultData: resultData || steps[flow.currentStep].resultData,
    };
    const nextStep = flow.currentStep + 1;
    if (nextStep < steps.length) {
      steps[nextStep] = { ...steps[nextStep], status: "active" };
    }
    const updated: TaskFlow = {
      ...flow,
      steps,
      currentStep: nextStep >= steps.length ? flow.currentStep : nextStep,
      updatedAt: Date.now(),
    };
    set({ activeFlow: updated });
  },

  skipStep: () => {
    const flow = get().activeFlow;
    if (!flow) return;
    const steps = [...flow.steps];
    if (!steps[flow.currentStep].optional) return;
    steps[flow.currentStep] = { ...steps[flow.currentStep], status: "skipped" };
    const nextStep = flow.currentStep + 1;
    if (nextStep < steps.length) {
      steps[nextStep] = { ...steps[nextStep], status: "active" };
    }
    set({
      activeFlow: {
        ...flow,
        steps,
        currentStep: nextStep >= steps.length ? flow.currentStep : nextStep,
        updatedAt: Date.now(),
      },
    });
  },

  cancelFlow: () => {
    const flow = get().activeFlow;
    if (!flow) return;
    const steps = flow.steps.map((s) =>
      s.status === "active" || s.status === "pending" ? { ...s, status: "error" as const } : s
    );
    set({
      activeFlow: null,
      flowHistory: [{ ...flow, steps }, ...get().flowHistory].slice(0, 50),
    });
  },

  completeFlow: (assetId) => {
    const flow = get().activeFlow;
    if (!flow) return;
    const completed: TaskFlow = {
      ...flow,
      resultAssetId: assetId,
      updatedAt: Date.now(),
    };
    set({
      activeFlow: null,
      flowHistory: [completed, ...get().flowHistory].slice(0, 50),
    });
  },

  resetFlow: () => set({ activeFlow: null }),

  errorStep: (errorMessage) => {
    const flow = get().activeFlow;
    if (!flow) return;
    const steps = [...flow.steps];
    steps[flow.currentStep] = {
      ...steps[flow.currentStep],
      status: "error",
      resultData: { error: errorMessage },
    };
    set({
      activeFlow: {
        ...flow,
        steps,
        updatedAt: Date.now(),
      },
    });
  },

  retryStep: () => {
    const flow = get().activeFlow;
    if (!flow) return;
    const steps = [...flow.steps];
    if (steps[flow.currentStep].status !== "error") return;
    steps[flow.currentStep] = {
      ...steps[flow.currentStep],
      status: "active",
      resultData: undefined,
    };
    set({
      activeFlow: {
        ...flow,
        steps,
        updatedAt: Date.now(),
      },
    });
  },

  resumeFlow: () => {
    const flow = get().activeFlow;
    if (!flow) return;
    // Find first non-completed step and set it to active
    const steps = [...flow.steps];
    const errorIdx = steps.findIndex((s) => s.status === "error");
    if (errorIdx >= 0) {
      steps[errorIdx] = { ...steps[errorIdx], status: "active", resultData: undefined };
      set({
        activeFlow: {
          ...flow,
          steps,
          currentStep: errorIdx,
          updatedAt: Date.now(),
        },
      });
    }
  },
}));

// ─── 预定义任务流模板 ───

export function createNfcFlow(): { title: string; module: TaskFlowModule; steps: TaskStep[] } {
  return {
    title: "NFC Card Workflow",
    module: "nfc",
    steps: [
      { id: "detect", title: "Detect Card", description: "Scan for nearby NFC tags", status: "pending", riskLevel: "safe" },
      { id: "read", title: "Read Card Data", description: "Read full card contents including UID, type, and memory", status: "pending", riskLevel: "safe" },
      { id: "analyze", title: "Analyze", description: "Identify manufacturer, protocol, and security features", status: "pending", riskLevel: "safe", optional: true },
      { id: "save", title: "Save to Library", description: "Save card data to your asset library with tags", status: "pending", riskLevel: "safe" },
      { id: "export", title: "Export Report", description: "Export card data as JSON report", status: "pending", riskLevel: "safe", optional: true },
    ],
  };
}

export function createSubghzFlow(): { title: string; module: TaskFlowModule; steps: TaskStep[] } {
  return {
    title: "Sub-GHz Signal Workflow",
    module: "subghz",
    steps: [
      { id: "scan", title: "Scan Band", description: "Scan frequency band for active signals", status: "pending", riskLevel: "safe" },
      { id: "capture", title: "Capture Signal", description: "Capture a specific signal for analysis", status: "pending", riskLevel: "safe" },
      { id: "recognize", title: "Recognize Protocol", description: "Identify the signal protocol (PT2262, EV1527, etc.)", status: "pending", riskLevel: "safe" },
      { id: "save", title: "Save to Library", description: "Save signal data to your asset library", status: "pending", riskLevel: "safe" },
      { id: "replay", title: "Replay Approval", description: "Request approval to replay the signal (requires region check)", status: "pending", riskLevel: "dangerous", optional: true },
    ],
  };
}

export function createIrFlow(): { title: string; module: TaskFlowModule; steps: TaskStep[] } {
  return {
    title: "IR Remote Workflow",
    module: "ir",
    steps: [
      { id: "learn", title: "Learn Remote", description: "Capture IR signals from a physical remote", status: "pending", riskLevel: "safe" },
      { id: "map", title: "Map Buttons", description: "Assign captured signals to button names (Power, Vol+, etc.)", status: "pending", riskLevel: "safe" },
      { id: "test", title: "Test Signals", description: "Test each mapped button to verify correct capture", status: "pending", riskLevel: "safe" },
      { id: "save", title: "Save Remote Profile", description: "Save the complete remote profile to your library", status: "pending", riskLevel: "safe" },
    ],
  };
}

export function createBadusbFlow(): { title: string; module: TaskFlowModule; steps: TaskStep[] } {
  return {
    title: "BadUSB Script Workflow",
    module: "badusb",
    steps: [
      { id: "edit", title: "Import / Edit Script", description: "Write or import a DuckyScript payload", status: "pending", riskLevel: "caution" },
      { id: "validate", title: "Validate (AST)", description: "Run AST analysis to identify dangerous commands", status: "pending", riskLevel: "caution" },
      { id: "preview", title: "Preview Simulation", description: "Step-by-step simulation preview of execution", status: "pending", riskLevel: "caution" },
      { id: "approve", title: "Manual Approval", description: "User must manually confirm execution", status: "pending", riskLevel: "dangerous" },
      { id: "execute", title: "Execute", description: "Execute the script on the target device", status: "pending", riskLevel: "dangerous" },
      { id: "audit", title: "Audit Export", description: "Export execution audit log", status: "pending", riskLevel: "safe", optional: true },
    ],
  };
}

export function createFirmwareFlow(): { title: string; module: TaskFlowModule; steps: TaskStep[] } {
  return {
    title: "Firmware Update Workflow",
    module: "firmware",
    steps: [
      { id: "check", title: "Check for Updates", description: "Check if a newer firmware version is available", status: "pending", riskLevel: "safe" },
      { id: "verify", title: "Verify Signature", description: "Verify Ed25519 signature and API level compatibility", status: "pending", riskLevel: "safe" },
      { id: "backup", title: "Backup Current", description: "Backup current firmware to inactive partition", status: "pending", riskLevel: "caution" },
      { id: "upgrade", title: "Upgrade", description: "Flash new firmware to inactive partition", status: "pending", riskLevel: "dangerous" },
      { id: "reboot", title: "Reboot & Confirm", description: "Reboot device and confirm new firmware is active", status: "pending", riskLevel: "caution" },
    ],
  };
}
