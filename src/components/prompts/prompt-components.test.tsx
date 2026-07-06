import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RequirementPreset } from "@/db/schema";
import type { PromptRecipe } from "@/server/prompt-recipes";

import { PromptRecipeDialog } from "./prompt-recipe-dialog";
import { RequirementSelector } from "./requirement-selector";
import { StagePromptDialog } from "./stage-prompt-dialog";

afterEach(() => {
  cleanup();
});

function requirement(overrides: Partial<RequirementPreset> = {}): RequirementPreset {
  return {
    id: "req-1",
    stableKey: "REQ-001",
    ownerId: "local_user",
    stage: "draft",
    category: "风格",
    type: "prefer",
    label: "专业克制",
    description: "表达要克制",
    promptFragment: "保持专业克制。",
    defaultEnabled: false,
    enabled: true,
    priority: 500,
    source: "seed",
    archivedAt: null,
    createdAt: "2026-06-28T10:00:00.000Z",
    updatedAt: "2026-06-28T10:00:00.000Z",
    ...overrides
  };
}

describe("prompt components", () => {
  it("filters and toggles selectable requirements", () => {
    const onChange = vi.fn();
    render(
      <RequirementSelector
        title="可选提示词"
        stage="draft"
        requirements={[
          requirement(),
          requirement({
            id: "req-2",
            stableKey: "REQ-002",
            category: "禁区",
            type: "avoid",
            label: "不要空话",
            description: "删除泛泛而谈",
            promptFragment: "不要泛泛而谈。"
          })
        ]}
        selectedIds={[]}
        pending={false}
        onChange={onChange}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("搜索提示词"), { target: { value: "空话" } });

    expect(screen.getByText("1 / 2 条可用")).toBeInTheDocument();
    const optionCheckbox = screen
      .getAllByRole("checkbox")
      .find((checkbox) => checkbox.closest(".requirement-option")?.textContent?.includes("不要空话"));
    expect(optionCheckbox).toBeDefined();

    fireEvent.click(optionCheckbox as HTMLElement);
    expect(onChange).toHaveBeenCalledWith(["req-2"]);

    fireEvent.click(screen.getByLabelText("只看已选"));
    expect(screen.getByText("没有匹配的可选提示词。")).toBeInTheDocument();
  });

  it("creates, updates, archives, and deletes requirement presets", () => {
    const onCreate = vi.fn(async () => undefined);
    const onUpdate = vi.fn(async () => undefined);
    const onDelete = vi.fn(async () => undefined);
    render(
      <RequirementSelector
        title="可选提示词"
        stage="outline"
        requirements={[requirement({ defaultEnabled: true })]}
        selectedIds={[]}
        pending={false}
        onChange={vi.fn()}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByText("管理可选提示词"));
    fireEvent.change(screen.getByPlaceholderText("标签"), { target: { value: "一句话判断" } });
    fireEvent.change(screen.getByPlaceholderText("说明"), { target: { value: "主线要明确" } });
    fireEvent.change(screen.getByPlaceholderText("提示词片段"), { target: { value: "主线只写一句判断。" } });
    fireEvent.change(screen.getAllByLabelText("可选提示词类型")[0], { target: { value: "must" } });
    fireEvent.click(screen.getAllByText("默认勾选")[0]);
    fireEvent.click(screen.getByRole("button", { name: "新增" }));

    expect(onCreate).toHaveBeenCalledWith({
      stage: "outline",
      category: "自定义",
      type: "must",
      label: "一句话判断",
      description: "主线要明确",
      promptFragment: "主线只写一句判断。",
      defaultEnabled: true,
      priority: 500
    });

    fireEvent.change(screen.getByDisplayValue("专业克制"), { target: { value: "更克制" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onUpdate).toHaveBeenCalledWith(
      "req-1",
      expect.objectContaining({
        stage: "outline",
        label: "更克制",
        defaultEnabled: true
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "停用" }));
    expect(onUpdate).toHaveBeenCalledWith("req-1", { enabled: false, archived: false });

    fireEvent.click(screen.getByRole("button", { name: "归档" }));
    expect(onUpdate).toHaveBeenCalledWith("req-1", { enabled: false, archived: true });

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(onDelete).toHaveBeenCalledWith("req-1");
  });

  it("opens and closes stage prompt dialog", () => {
    const onDefaultPromptChange = vi.fn();
    const onSaveDefaultPrompt = vi.fn(async () => undefined);
    render(
      <StagePromptDialog
        title="Markdown 文案提示词设置"
        stage="draft"
        defaultPromptLabel="Markdown 文案默认提示词"
        defaultPrompt="文案要专业克制。"
        onDefaultPromptChange={onDefaultPromptChange}
        onSaveDefaultPrompt={onSaveDefaultPrompt}
        requirements={[requirement()]}
        selectedIds={["req-1"]}
        onSelectedIdsChange={vi.fn()}
        pending={false}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开Markdown 文案提示词设置" }));

    expect(screen.getByRole("dialog", { name: "Markdown 文案提示词设置" })).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("文案要专业克制。"), { target: { value: "文案更克制。" } });
    expect(onDefaultPromptChange).toHaveBeenCalledWith("文案更克制。");

    fireEvent.click(screen.getByRole("button", { name: "保存默认提示词" }));
    expect(onSaveDefaultPrompt).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "关闭提示词设置" }));
    expect(screen.queryByRole("dialog", { name: "Markdown 文案提示词设置" })).not.toBeInTheDocument();
  });

  it("can show a requirement-only prompt dialog for topic diagnosis", () => {
    render(
      <StagePromptDialog
        title="选题诊断提示词设置"
        stage="topic"
        defaultPromptLabel="选题诊断默认提示词"
        defaultPrompt=""
        onDefaultPromptChange={vi.fn()}
        onSaveDefaultPrompt={vi.fn(async () => undefined)}
        requirements={[requirement({ stage: "topic", label: "目标读者具体", category: "读者", defaultEnabled: true })]}
        selectedIds={["req-1"]}
        onSelectedIdsChange={vi.fn()}
        pending={false}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        showDefaultPrompt={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开选题诊断提示词设置" }));

    expect(screen.getByRole("dialog", { name: "选题诊断提示词设置" })).toBeInTheDocument();
    expect(screen.queryByText("默认提示词")).not.toBeInTheDocument();
    expect(screen.getAllByText("目标读者具体").length).toBeGreaterThan(0);
  });

  it("renders prompt recipe snapshots and closes with Escape", () => {
    const onClose = vi.fn();
    const recipe: PromptRecipe = {
      articleId: "article-1",
      invocationId: "invocation-1",
      taskType: "generate_draft",
      model: "fake-model",
      baseUrl: null,
      status: "success",
      createdAt: "2026-06-28T10:00:00.000Z",
      stageDefaultPrompt: {
        label: "Markdown 默认提示词",
        prompt: "专业克制。"
      },
      upstreamTopicDiagnosis: {
        diagnosisId: "topic-diagnosis-1",
        verdict: "revise",
        targetReaderCheck: "目标读者需要更具体。",
        readerProblemCheck: "真实问题是家庭资金路径。",
        timelinessCheck: "有今天点开的理由。",
        actionabilityCheck: "可以继续，但要处理边界。",
        riskSummary: "容易写成工具宣传。",
        suggestionsMarkdown: "补强家庭场景。",
        nextAction: "先补一句读者场景。",
        qualityGate: {
          stage: "topic",
          verdict: "revise",
          ownedChecks: [
            {
              checkId: "topic.precondition",
              status: "issue",
              evidence: "目标读者需要更具体。",
              suggestion: "补强家庭场景。"
            },
            {
              checkId: "topic.value",
              status: "issue",
              evidence: "选题容易写成工具宣传。",
              suggestion: "把角度收束到资金路径。"
            }
          ],
          upstreamRework: [],
          summaryForDownstream: "后续节点要聚焦家庭资金路径。"
        },
        topicSnapshot: "跨境支付通",
        targetReaderSnapshot: "跨境家庭",
        coreProblemSnapshot: "资金路径",
        hotAnchorSnapshot: "热点",
        customInstructionSnapshot: null,
        createdAt: "2026-06-28T09:00:00.000Z"
      },
      selectedRequirements: [
        {
          id: "snap-1",
          requirementPresetId: "req-1",
          stableKey: "REQ-001",
          label: "专业克制",
          promptFragment: "保持专业克制。",
          stage: "draft",
          createdAt: "2026-06-28T10:00:00.000Z"
        }
      ],
      customInstruction: "开头先从家庭生活场景进入。",
      finalPrompt: "最终提示词内容"
    };

    render(<PromptRecipeDialog recipe={recipe} onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "提示词配方" })).toBeInTheDocument();
    expect(screen.getByText("Markdown 默认提示词")).toBeInTheDocument();
    expect(screen.getByText("诊断结论：revise")).toBeInTheDocument();
    expect(screen.getByText("主要风险：容易写成工具宣传。")).toBeInTheDocument();
    expect(screen.getByText("REQ-001")).toBeInTheDocument();
    expect(screen.getByText("开头先从家庭生活场景进入。")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders empty prompt recipe states and closes from the close icon", () => {
    const onClose = vi.fn();
    const recipe: PromptRecipe = {
      articleId: "article-1",
      invocationId: null,
      taskType: "generate_outline",
      model: null,
      baseUrl: null,
      status: null,
      createdAt: null,
      emptyReason: "这个版本没有绑定 AI 提示词记录。",
      stageDefaultPrompt: null,
      upstreamTopicDiagnosis: null,
      selectedRequirements: [],
      customInstruction: "",
      finalPrompt: ""
    };

    render(<PromptRecipeDialog recipe={recipe} onClose={onClose} />);

    expect(screen.getByText("这个版本没有绑定 AI 提示词记录。")).toBeInTheDocument();
    expect(screen.getByText("无生成时间")).toBeInTheDocument();
    expect(screen.getByText("没有默认提示词快照。")).toBeInTheDocument();
    expect(screen.getByText("没有可选提示词快照。")).toBeInTheDocument();
    expect(screen.getByText("没有本次要求。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭提示词配方" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
