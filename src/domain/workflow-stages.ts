import type { QualityGateStage } from "./quality-gates";
import type { ArticleStatus } from "./status";
import type { RequirementStage, StagePromptStage } from "./stages";

export const DOMAIN_STAGES = [
  "topic",
  "angle",
  "research",
  "outline",
  "draft",
  "final",
  "illustration",
  "publish",
  "review"
] as const;

export type DomainStage = (typeof DOMAIN_STAGES)[number];

export const WORKSPACE_IDS = ["topic", "build", "draft", "publish"] as const;

export type WorkspaceId = (typeof WORKSPACE_IDS)[number];

export const ARTICLE_LIFECYCLES = ["active", "ready_to_publish", "published", "archived"] as const;

export type ArticleLifecycle = (typeof ARTICLE_LIFECYCLES)[number];

export type WorkflowStageDefinition = {
  id: DomainStage;
  label: string;
  workspace: WorkspaceId;
  dependencies: readonly DomainStage[];
  optionalDependencies: readonly DomainStage[];
  humanGate: boolean;
  requirementStages: readonly RequirementStage[];
  promptStages: readonly StagePromptStage[];
  qualityGateStages: readonly Exclude<QualityGateStage, "local">[];
  legacyStatuses: readonly ArticleStatus[];
  legacyTabs: readonly string[];
};

export const WORKFLOW_STAGE_REGISTRY = [
  {
    id: "topic",
    label: "主题与选题",
    workspace: "topic",
    dependencies: [],
    optionalDependencies: [],
    humanGate: false,
    requirementStages: ["topic"],
    promptStages: [],
    qualityGateStages: ["topic"],
    legacyStatuses: ["topic_created", "topic_diagnosed"],
    legacyTabs: ["topic", "topic-diagnosis"]
  },
  {
    id: "angle",
    label: "写作角度",
    workspace: "topic",
    dependencies: ["topic"],
    optionalDependencies: [],
    humanGate: true,
    requirementStages: ["angle"],
    promptStages: ["angle"],
    qualityGateStages: ["angle"],
    legacyStatuses: ["angles_generated", "angle_selected"],
    legacyTabs: ["angles"]
  },
  {
    id: "research",
    label: "内容研究",
    workspace: "build",
    dependencies: ["topic", "angle"],
    optionalDependencies: [],
    humanGate: false,
    requirementStages: ["research"],
    promptStages: ["research"],
    qualityGateStages: ["research"],
    legacyStatuses: [],
    legacyTabs: ["research"]
  },
  {
    id: "outline",
    label: "主线提纲",
    workspace: "build",
    dependencies: ["topic", "angle", "research"],
    optionalDependencies: [],
    humanGate: true,
    requirementStages: ["outline"],
    promptStages: ["outline"],
    qualityGateStages: ["outline"],
    legacyStatuses: ["outline_generated", "outline_review"],
    legacyTabs: ["outline"]
  },
  {
    id: "draft",
    label: "Markdown 文案",
    workspace: "draft",
    dependencies: ["topic", "angle", "research", "outline"],
    optionalDependencies: [],
    humanGate: false,
    requirementStages: ["draft", "ai_style_check"],
    promptStages: ["draft", "ai_style_check"],
    qualityGateStages: ["draft"],
    legacyStatuses: ["draft_generated", "dbs_checking", "revision_generated"],
    legacyTabs: ["draft"]
  },
  {
    id: "final",
    label: "人工最终稿",
    workspace: "draft",
    dependencies: ["draft"],
    optionalDependencies: [],
    humanGate: true,
    requirementStages: [],
    promptStages: [],
    qualityGateStages: [],
    legacyStatuses: ["human_review"],
    legacyTabs: ["final"]
  },
  {
    id: "illustration",
    label: "文章配图",
    workspace: "publish",
    dependencies: ["final"],
    optionalDependencies: [],
    humanGate: true,
    requirementStages: ["illustration_plan"],
    promptStages: ["illustration_plan"],
    qualityGateStages: ["illustration_plan"],
    legacyStatuses: [],
    legacyTabs: ["illustration"]
  },
  {
    id: "publish",
    label: "发布",
    workspace: "publish",
    dependencies: ["final"],
    optionalDependencies: ["illustration"],
    humanGate: true,
    requirementStages: ["pre_publish"],
    promptStages: ["pre_publish"],
    qualityGateStages: ["pre_publish"],
    legacyStatuses: [
      "ready_to_publish",
      "publish_package_generated",
      "cover_generated",
      "uploaded_to_draft_box",
      "published_manually"
    ],
    legacyTabs: ["publish"]
  },
  {
    id: "review",
    label: "复盘",
    workspace: "publish",
    dependencies: ["publish"],
    optionalDependencies: [],
    humanGate: true,
    requirementStages: ["review"],
    promptStages: ["review"],
    qualityGateStages: [],
    legacyStatuses: ["review_pending", "review_recorded"],
    legacyTabs: ["review"]
  }
] as const satisfies readonly WorkflowStageDefinition[];

export function getWorkflowStage(stage: DomainStage): WorkflowStageDefinition {
  const definition = WORKFLOW_STAGE_REGISTRY.find((candidate) => candidate.id === stage);
  if (!definition) {
    throw new Error(`Unknown workflow stage: ${stage}`);
  }
  return definition;
}

export function getDomainStageForLegacyStatus(status: ArticleStatus): DomainStage {
  const definition = WORKFLOW_STAGE_REGISTRY.find((stage) => stage.legacyStatuses.includes(status as never));
  if (!definition) {
    throw new Error(`Article status is not mapped to a workflow stage: ${status}`);
  }
  return definition.id;
}

export function getArticleLifecycleFromLegacyStatus(status: ArticleStatus): ArticleLifecycle {
  if (["published_manually", "review_pending", "review_recorded"].includes(status)) {
    return "published";
  }
  if (["ready_to_publish", "publish_package_generated", "cover_generated", "uploaded_to_draft_box"].includes(status)) {
    return "ready_to_publish";
  }
  return "active";
}

export function hasWorkflowStageDependencyCycle(registry: readonly WorkflowStageDefinition[] = WORKFLOW_STAGE_REGISTRY): boolean {
  const visiting = new Set<DomainStage>();
  const visited = new Set<DomainStage>();
  const byId = new Map(registry.map((stage) => [stage.id, stage]));

  const visit = (stageId: DomainStage): boolean => {
    if (visiting.has(stageId)) {
      return true;
    }
    if (visited.has(stageId)) {
      return false;
    }
    visiting.add(stageId);
    const stage = byId.get(stageId);
    for (const dependency of [...(stage?.dependencies || []), ...(stage?.optionalDependencies || [])]) {
      if (visit(dependency)) {
        return true;
      }
    }
    visiting.delete(stageId);
    visited.add(stageId);
    return false;
  };

  return registry.some((stage) => visit(stage.id));
}

export function listDownstreamStages(stage: DomainStage): DomainStage[] {
  const downstream = new Set<DomainStage>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const candidate of WORKFLOW_STAGE_REGISTRY) {
      if (candidate.id === stage || downstream.has(candidate.id)) {
        continue;
      }
      const dependencies = [...candidate.dependencies, ...candidate.optionalDependencies];
      if (dependencies.some((dependency) => dependency === stage || downstream.has(dependency))) {
        downstream.add(candidate.id);
        changed = true;
      }
    }
  }

  return DOMAIN_STAGES.filter((candidate) => downstream.has(candidate));
}
