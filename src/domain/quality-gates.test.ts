import { describe, expect, it } from "vitest";

import { getQualityCheck, hasDuplicateQualityCheckIds, listQualityChecks, QUALITY_CHECKS, QUALITY_GATE_STAGES } from "./quality-gates";

describe("quality gate definitions", () => {
  it("keeps quality checks uniquely owned", () => {
    expect(hasDuplicateQualityCheckIds(QUALITY_CHECKS)).toBe(false);
    expect(listQualityChecks("topic").map((check) => check.id)).toEqual(["topic.precondition", "topic.value"]);
    expect(listQualityChecks("outline").map((check) => check.id)).toEqual([
      "outline.cognitive_gap",
      "outline.mainline_judgment",
      "outline.structure_load"
    ]);
    expect(listQualityChecks("draft").map((check) => check.id)).toEqual([
      "draft.text_cleanliness",
      "draft.expression_efficiency",
      "draft.ai_trace"
    ]);
  });

  it("does not assign new quality ownership to legacy dbs-content", () => {
    expect(QUALITY_GATE_STAGES as readonly string[]).not.toContain("dbs");
    expect(listQualityChecks().some((check) => (check.ownerStage as string) === "dbs")).toBe(false);
  });

  it("keeps downstream checks out of upstream owners", () => {
    expect(listQualityChecks("topic").map((check) => check.id)).not.toContain("draft.text_cleanliness");
    expect(listQualityChecks("draft").map((check) => check.id)).not.toContain("topic.precondition");
    expect(listQualityChecks("draft").map((check) => check.id)).not.toContain("outline.cognitive_gap");
  });

  it("looks up checks by stable id", () => {
    expect(getQualityCheck("pre_publish.release_risk")?.blockingLevel).toBe("block");
    expect(getQualityCheck("dbs.content_quality")).toBeUndefined();
  });
});
