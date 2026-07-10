import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FinalPanel, WorkflowPanel } from "./workflow-panels";

afterEach(cleanup);

describe("workflow panels", () => {
  it("connects a panel to its workflow tab and renders head actions", () => {
    render(
      <WorkflowPanel headActions={<button type="button">版本</button>} tabId="outline" title="主线和提纲">
        <p>提纲内容</p>
      </WorkflowPanel>
    );

    expect(screen.getByRole("tabpanel", { name: "" })).toHaveAttribute("id", "workflow-panel-outline");
    expect(screen.getByRole("button", { name: "版本" })).toBeInTheDocument();
    expect(screen.getByText("提纲内容")).toBeInTheDocument();
  });

  it("renders final draft status from a presentation value", () => {
    render(<FinalPanel finalVersionNo={6}>内容</FinalPanel>);

    expect(screen.getByText("最终稿 v6")).toBeInTheDocument();
  });
});
