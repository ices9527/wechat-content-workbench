import { ArrowRight, CircleAlert } from "lucide-react";

import type { WorkflowGuidance } from "@/domain/workflow-guidance";
import { getWorkflowStage } from "@/domain/workflow-stages";

export function WorkflowGuidanceCard({ guidance, onJump }: { guidance: WorkflowGuidance; onJump: (tab: string) => void }) {
  if (guidance.kind === "continue" || !guidance.targetStage || !guidance.targetTab) {
    return null;
  }
  const targetLabel = getWorkflowStage(guidance.targetStage).label;

  return (
    <section className={guidance.blocking ? "workflow-guidance-card blocking" : "workflow-guidance-card"}>
      <div className="workflow-guidance-copy">
        <CircleAlert aria-hidden="true" size={19} strokeWidth={1.9} />
        <div>
          <strong>{guidance.blocking ? "需先处理" : "建议调整"}：{targetLabel}</strong>
          <p>{guidance.reason}</p>
          <span>{guidance.suggestedAction}</span>
        </div>
      </div>
      <button className="button secondary workflow-guidance-action" onClick={() => onJump(guidance.targetTab as string)} type="button">
        前往{targetLabel}
        <ArrowRight aria-hidden="true" size={16} />
      </button>
    </section>
  );
}
