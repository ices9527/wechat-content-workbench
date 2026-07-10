import type { ArticleStatus } from "@/domain/status";

import type { WorkspaceShellItem } from "./workspace-shell";

export type WorkflowTabId =
  | "topic"
  | "topic-diagnosis"
  | "angles"
  | "research"
  | "outline"
  | "draft"
  | "final"
  | "illustration"
  | "publish"
  | "review";

export const WORKFLOW_TABS: Array<{ id: WorkflowTabId; label: string }> = [
  { id: "topic", label: "主题" },
  { id: "topic-diagnosis", label: "选题诊断" },
  { id: "angles", label: "角度" },
  { id: "research", label: "内容研究" },
  { id: "outline", label: "主线提纲" },
  { id: "draft", label: "Markdown 文案" },
  { id: "final", label: "人工检查/最终稿" },
  { id: "illustration", label: "配图规划" },
  { id: "publish", label: "发布" },
  { id: "review", label: "复盘" }
];

export const WORKFLOW_WORKSPACES: Array<WorkspaceShellItem<WorkflowTabId>> = [
  {
    id: "topic",
    label: "定题",
    tabs: WORKFLOW_TABS.filter((tab) => ["topic", "topic-diagnosis", "angles"].includes(tab.id))
  },
  {
    id: "build",
    label: "构建",
    tabs: WORKFLOW_TABS.filter((tab) => ["research", "outline"].includes(tab.id))
  },
  {
    id: "draft",
    label: "成稿",
    tabs: WORKFLOW_TABS.filter((tab) => ["draft", "final"].includes(tab.id))
  },
  {
    id: "publish",
    label: "发布与复盘",
    tabs: WORKFLOW_TABS.filter((tab) => ["illustration", "publish", "review"].includes(tab.id))
  }
];

export function isWorkflowTabId(value: string | null): value is WorkflowTabId {
  return WORKFLOW_TABS.some((tab) => tab.id === value);
}

export function defaultTabForStatus(status: ArticleStatus): WorkflowTabId {
  if (status === "topic_created" || status === "topic_diagnosed") {
    return "topic-diagnosis";
  }
  if (status === "angles_generated") {
    return "angles";
  }
  if (status === "angle_selected") {
    return "research";
  }
  if (status === "outline_generated") {
    return "outline";
  }
  if (status === "outline_review" || status === "draft_generated") {
    return "draft";
  }
  if (status === "dbs_checking" || status === "revision_generated" || status === "human_review") {
    return "final";
  }
  if (status === "published_manually" || status === "review_pending" || status === "review_recorded") {
    return "review";
  }
  return "publish";
}
