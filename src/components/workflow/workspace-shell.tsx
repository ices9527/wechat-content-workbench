import { Blocks, FileText, Lightbulb, Send } from "lucide-react";
import type { ReactNode } from "react";

export type WorkspaceShellId = "topic" | "build" | "draft" | "publish";

export type WorkspaceShellItem<TabId extends string> = {
  id: WorkspaceShellId;
  label: string;
  tabs: Array<{ id: TabId; label: string }>;
};

const WORKSPACE_ICONS = {
  topic: Lightbulb,
  build: Blocks,
  draft: FileText,
  publish: Send
} as const;

export function WorkspaceShell<TabId extends string>({
  workspaces,
  activeTab,
  getTabMeta,
  onSelectTab,
  children
}: {
  workspaces: Array<WorkspaceShellItem<TabId>>;
  activeTab: TabId;
  getTabMeta: (tabId: TabId) => string;
  onSelectTab: (tabId: TabId) => void;
  children: ReactNode;
}) {
  const activeWorkspace = workspaces.find((workspace) => workspace.tabs.some((tab) => tab.id === activeTab)) || workspaces[0];

  return (
    <>
      <div className="workspace-switcher-card">
        <div aria-label="公众号生产工作阶段" className="workspace-switcher">
          {workspaces.map((workspace) => {
            const Icon = WORKSPACE_ICONS[workspace.id];
            const active = workspace.id === activeWorkspace.id;
            return (
              <button
                aria-pressed={active}
                className={active ? "workspace-switch active" : "workspace-switch"}
                key={workspace.id}
                onClick={() => onSelectTab(workspace.tabs[0].id)}
                type="button"
              >
                <Icon aria-hidden="true" size={17} strokeWidth={1.9} />
                <span>{workspace.label}</span>
              </button>
            );
          })}
        </div>

        <div aria-label={`${activeWorkspace.label}节点`} className="workflow-stage-tabs" role="tablist">
          {activeWorkspace.tabs.map((tab) => (
            <button
              aria-controls={`workflow-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? "workflow-stage-tab active" : "workflow-stage-tab"}
              id={`workflow-tab-${tab.id}`}
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              role="tab"
              type="button"
            >
              <span>{tab.label}</span>
              <span>{getTabMeta(tab.id)}</span>
            </button>
          ))}
        </div>
      </div>
      {children}
    </>
  );
}
