import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceShell } from "./workspace-shell";

const workspaces = [
  { id: "topic" as const, label: "定题", tabs: [{ id: "topic", label: "主题" }, { id: "angles", label: "角度" }] },
  { id: "build" as const, label: "构建", tabs: [{ id: "research", label: "内容研究" }, { id: "outline", label: "主线提纲" }] },
  { id: "draft" as const, label: "成稿", tabs: [{ id: "draft", label: "Markdown 文案" }] },
  { id: "publish" as const, label: "发布与复盘", tabs: [{ id: "publish", label: "发布" }] }
];

afterEach(cleanup);

describe("WorkspaceShell", () => {
  it("shows four workspaces and only the active workspace stage tabs", () => {
    render(
      <WorkspaceShell activeTab="outline" getTabMeta={() => "待做"} onSelectTab={() => undefined} workspaces={workspaces}>
        <div>当前内容</div>
      </WorkspaceShell>
    );

    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(3);
    expect(screen.getByRole("button", { pressed: true })).toHaveTextContent("构建");
    expect(screen.getByRole("tab", { name: /内容研究/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /主线提纲/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: /Markdown 文案/ })).not.toBeInTheDocument();
  });

  it("opens the first stage when another workspace is selected", () => {
    const onSelectTab = vi.fn();
    render(
      <WorkspaceShell activeTab="topic" getTabMeta={() => "已建"} onSelectTab={onSelectTab} workspaces={workspaces}>
        <div />
      </WorkspaceShell>
    );

    fireEvent.click(screen.getByRole("button", { name: /构建/ }));
    expect(onSelectTab).toHaveBeenCalledWith("research");
  });
});
