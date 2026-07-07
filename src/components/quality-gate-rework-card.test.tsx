import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { QualityGateReworkItem } from "@/domain/quality-gate-rework";

import { QualityGateReworkCard } from "./quality-gate-rework-card";

afterEach(() => {
  cleanup();
});

function reworkItem(overrides: Partial<QualityGateReworkItem> = {}): QualityGateReworkItem {
  return {
    id: "draft-check:topic:topic.value",
    sourceId: "draft-check",
    sourceLabel: "文案清洁检查",
    sourceStage: "draft",
    sourceVerdict: "revise",
    targetStage: "topic",
    targetTab: "topic",
    targetLabel: "主题",
    checkId: "topic.value",
    checkLabel: "选题价值",
    blockingLevel: "block",
    reason: "文案阶段发现读者为什么现在需要读仍不清楚。",
    suggestedAction: "回到主题页收敛读者问题，再重新运行选题诊断。",
    sourceSummary: "不要继续硬改正文。",
    ...overrides
  };
}

describe("QualityGateReworkCard", () => {
  it("renders upstream rework items and jumps to target tabs", () => {
    const onJumpToTab = vi.fn();
    render(<QualityGateReworkCard items={[reworkItem()]} onJumpToTab={onJumpToTab} />);

    expect(screen.getByRole("region", { name: "质量门回流建议" })).toBeInTheDocument();
    expect(screen.getByText("需要回到上游处理")).toBeInTheDocument();
    expect(screen.getByText("1 条会阻断继续推进。")).toBeInTheDocument();
    expect(screen.getByText("文案清洁检查 发现 · 回到 主题")).toBeInTheDocument();
    expect(screen.getByText("选题价值")).toBeInTheDocument();
    expect(screen.getByText("文案阶段发现读者为什么现在需要读仍不清楚。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "回到主题" }));
    expect(onJumpToTab).toHaveBeenCalledWith("topic");
  });

  it("does not render when there are no rework items", () => {
    const { container } = render(<QualityGateReworkCard items={[]} onJumpToTab={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("uses non-blocking copy when all items are warnings", () => {
    render(
      <QualityGateReworkCard
        items={[
          reworkItem({
            id: "draft-check:draft:draft.text_cleanliness",
            targetStage: "draft",
            targetTab: "draft",
            targetLabel: "Markdown 文案",
            checkId: "draft.text_cleanliness",
            checkLabel: "文字洁癖",
            blockingLevel: "warn"
          })
        ]}
        onJumpToTab={vi.fn()}
      />
    );

    expect(screen.getByText("这些建议不会自动修改内容，需要你回到对应节点确认。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回到Markdown 文案" })).toBeInTheDocument();
  });
});
