import { describe, expect, it } from "vitest";

import { ARTICLE_STATUSES } from "./status";
import { QUALITY_GATE_STAGES } from "./quality-gates";
import { REQUIREMENT_STAGES, STAGE_PROMPT_STAGES } from "./stages";
import {
  DOMAIN_STAGES,
  WORKFLOW_STAGE_REGISTRY,
  WORKSPACE_IDS,
  getArticleLifecycleFromLegacyStatus,
  getDomainStageForLegacyStatus,
  getWorkflowStage,
  hasWorkflowStageDependencyCycle,
  listDownstreamStages
} from "./workflow-stages";

describe("workflow stage registry", () => {
  it("defines one canonical ordered stage list and four workspaces", () => {
    expect(DOMAIN_STAGES).toEqual([
      "topic",
      "angle",
      "research",
      "outline",
      "draft",
      "final",
      "illustration",
      "publish",
      "review"
    ]);
    expect(WORKSPACE_IDS).toEqual(["topic", "build", "draft", "publish"]);
    expect(WORKFLOW_STAGE_REGISTRY.map((stage) => stage.id)).toEqual(DOMAIN_STAGES);
    expect(new Set(WORKFLOW_STAGE_REGISTRY.map((stage) => stage.id)).size).toBe(DOMAIN_STAGES.length);
  });

  it("keeps dependencies valid and acyclic", () => {
    const stageIds = new Set(DOMAIN_STAGES);
    for (const stage of WORKFLOW_STAGE_REGISTRY) {
      for (const dependency of [...stage.dependencies, ...stage.optionalDependencies]) {
        expect(stageIds.has(dependency)).toBe(true);
      }
    }
    expect(hasWorkflowStageDependencyCycle()).toBe(false);
  });

  it("maps every legacy vocabulary value to exactly one domain stage", () => {
    const requirementMappings = WORKFLOW_STAGE_REGISTRY.flatMap((stage) => stage.requirementStages);
    const promptMappings = WORKFLOW_STAGE_REGISTRY.flatMap((stage) => stage.promptStages);
    const qualityMappings = WORKFLOW_STAGE_REGISTRY.flatMap((stage) => stage.qualityGateStages);
    const legacyStatusMappings = WORKFLOW_STAGE_REGISTRY.flatMap((stage) => stage.legacyStatuses);

    expect(requirementMappings.sort()).toEqual([...REQUIREMENT_STAGES].sort());
    expect(promptMappings.sort()).toEqual([...STAGE_PROMPT_STAGES].sort());
    expect(qualityMappings.sort()).toEqual(QUALITY_GATE_STAGES.filter((stage) => stage !== "local").sort());
    expect(legacyStatusMappings.sort()).toEqual([...ARTICLE_STATUSES].sort());

    expect(new Set(requirementMappings).size).toBe(requirementMappings.length);
    expect(new Set(promptMappings).size).toBe(promptMappings.length);
    expect(new Set(qualityMappings).size).toBe(qualityMappings.length);
    expect(new Set(legacyStatusMappings).size).toBe(legacyStatusMappings.length);
  });

  it("projects legacy statuses to lifecycle and suggested domain stage", () => {
    expect(getArticleLifecycleFromLegacyStatus("topic_created")).toBe("active");
    expect(getArticleLifecycleFromLegacyStatus("ready_to_publish")).toBe("ready_to_publish");
    expect(getArticleLifecycleFromLegacyStatus("uploaded_to_draft_box")).toBe("ready_to_publish");
    expect(getArticleLifecycleFromLegacyStatus("published_manually")).toBe("published");
    expect(getArticleLifecycleFromLegacyStatus("review_recorded")).toBe("published");

    expect(getDomainStageForLegacyStatus("dbs_checking")).toBe("draft");
    expect(getDomainStageForLegacyStatus("human_review")).toBe("final");
    expect(getDomainStageForLegacyStatus("cover_generated")).toBe("publish");
    expect(getDomainStageForLegacyStatus("review_pending")).toBe("review");
  });

  it("returns transitive downstream stages in canonical order", () => {
    expect(listDownstreamStages("outline")).toEqual(["draft", "final", "illustration", "publish", "review"]);
    expect(listDownstreamStages("final")).toEqual(["illustration", "publish", "review"]);
    expect(listDownstreamStages("review")).toEqual([]);
  });

  it("exposes stable labels and workspace ownership", () => {
    expect(getWorkflowStage("topic")).toMatchObject({ label: "主题与选题", workspace: "topic" });
    expect(getWorkflowStage("research")).toMatchObject({ workspace: "build" });
    expect(getWorkflowStage("final")).toMatchObject({ workspace: "draft", humanGate: true });
    expect(getWorkflowStage("review")).toMatchObject({ workspace: "publish" });
  });
});
