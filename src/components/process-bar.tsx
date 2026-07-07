import clsx from "clsx";

import type { ArticleStatus } from "@/domain/status";

const steps: Array<{ status: ArticleStatus; label: string }> = [
  { status: "topic_created", label: "主题" },
  { status: "angles_generated", label: "角度" },
  { status: "outline_generated", label: "提纲" },
  { status: "draft_generated", label: "文案" },
  { status: "revision_generated", label: "修改" },
  { status: "human_review", label: "最终稿" },
  { status: "ready_to_publish", label: "发布包" },
  { status: "uploaded_to_draft_box", label: "草稿箱" },
  { status: "review_pending", label: "复盘" }
];

export function ProcessBar({ status }: { status: ArticleStatus }) {
  return (
    <div className="process" aria-label="文章流程">
      {steps.map((step) => (
        <span className={clsx("process-step", step.status === status && "active")} key={step.label}>
          {step.label}
        </span>
      ))}
    </div>
  );
}
