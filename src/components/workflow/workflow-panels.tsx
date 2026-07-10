import type { ReactNode } from "react";

import type { WorkflowTabId } from "./workflow-tabs";

export function WorkflowPanel({
  tabId,
  title,
  status,
  headActions,
  className,
  children
}: {
  tabId: WorkflowTabId;
  title: string;
  status?: ReactNode;
  headActions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`workflow-tab-${tabId}`}
      className={className ? `panel ${className}` : "panel"}
      id={`workflow-panel-${tabId}`}
      role="tabpanel"
      tabIndex={0}
    >
      <div className="panel-head">
        <h2 className="panel-title">{title}</h2>
        {headActions ? <div className="panel-head-actions">{headActions}</div> : status ? <span className="status">{status}</span> : null}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function AnglesPanel({ selected, children }: { selected: boolean; children: ReactNode }) {
  return (
    <WorkflowPanel tabId="angles" title="角度" status={selected ? "已选择" : null}>
      {children}
    </WorkflowPanel>
  );
}

export function ResearchPanel({ count, children }: { count: number; children: ReactNode }) {
  return (
    <WorkflowPanel tabId="research" title="内容研究资料包" status={count > 0 ? `${count} 版` : "待生成"}>
      {children}
    </WorkflowPanel>
  );
}

export function OutlinePanel({ headActions, children }: { headActions: ReactNode; children: ReactNode }) {
  return (
    <WorkflowPanel tabId="outline" title="主线和提纲" headActions={headActions}>
      {children}
    </WorkflowPanel>
  );
}

export function DraftPanel({ headActions, children }: { headActions: ReactNode; children: ReactNode }) {
  return (
    <WorkflowPanel tabId="draft" title="Markdown 文案" headActions={headActions}>
      {children}
    </WorkflowPanel>
  );
}

export function FinalPanel({ finalVersionNo, children }: { finalVersionNo: number | null; children: ReactNode }) {
  return (
    <WorkflowPanel tabId="final" title="版本链和最终稿" status={finalVersionNo ? `最终稿 v${finalVersionNo}` : null}>
      {children}
    </WorkflowPanel>
  );
}

export function IllustrationPanel({ status, children }: { status: string; children: ReactNode }) {
  return (
    <WorkflowPanel tabId="illustration" title="配图规划" status={status}>
      {children}
    </WorkflowPanel>
  );
}

export function PublishPanel({ uploaded, children }: { uploaded: boolean; children: ReactNode }) {
  return (
    <WorkflowPanel tabId="publish" title="发布包" status={uploaded ? "已上传草稿箱" : null}>
      {children}
    </WorkflowPanel>
  );
}

export function ReviewPanel({ status, children }: { status: string; children: ReactNode }) {
  return (
    <WorkflowPanel tabId="review" title="复盘" status={status}>
      {children}
    </WorkflowPanel>
  );
}
