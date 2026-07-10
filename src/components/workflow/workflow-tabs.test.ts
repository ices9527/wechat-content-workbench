import { describe, expect, it } from "vitest";

import { defaultTabForStatus, isWorkflowTabId, WORKFLOW_WORKSPACES } from "./workflow-tabs";

describe("workflow tabs", () => {
  it("groups every workflow tab into exactly one workspace", () => {
    const tabs = WORKFLOW_WORKSPACES.flatMap((workspace) => workspace.tabs.map((tab) => tab.id));

    expect(WORKFLOW_WORKSPACES.map((workspace) => workspace.label)).toEqual(["定题", "构建", "成稿", "发布与复盘"]);
    expect(new Set(tabs).size).toBe(tabs.length);
    expect(tabs).toHaveLength(10);
  });

  it("keeps legacy tab links and status defaults stable", () => {
    expect(isWorkflowTabId("topic-diagnosis")).toBe(true);
    expect(isWorkflowTabId("dbs")).toBe(false);
    expect(defaultTabForStatus("angle_selected")).toBe("research");
    expect(defaultTabForStatus("human_review")).toBe("final");
    expect(defaultTabForStatus("review_recorded")).toBe("review");
  });
});
