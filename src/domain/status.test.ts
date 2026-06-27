import { describe, expect, it } from "vitest";

import { assertCanTransition, canTransition, getNextAction, isPublishQueueStatus } from "./status";

describe("article status machine", () => {
  it("allows the first writing transitions", () => {
    expect(canTransition("topic_created", "angles_generated")).toBe(true);
    expect(canTransition("angles_generated", "angle_selected")).toBe(true);
  });

  it("allows reselecting an angle before publish workflow starts", () => {
    expect(canTransition("outline_generated", "angle_selected")).toBe(true);
    expect(canTransition("outline_review", "angle_selected")).toBe(true);
    expect(canTransition("draft_generated", "angle_selected")).toBe(true);
    expect(canTransition("dbs_checking", "angle_selected")).toBe(true);
    expect(canTransition("revision_generated", "angle_selected")).toBe(true);
  });

  it("allows regenerating a markdown draft before publish workflow starts", () => {
    expect(canTransition("dbs_checking", "draft_generated")).toBe(true);
    expect(canTransition("revision_generated", "draft_generated")).toBe(true);
  });

  it("keeps publish queue states from jumping back to angle selection", () => {
    expect(canTransition("ready_to_publish", "angle_selected")).toBe(false);
    expect(canTransition("published_manually", "angle_selected")).toBe(false);
    expect(canTransition("ready_to_publish", "draft_generated")).toBe(false);
  });

  it("rejects jumping directly to ready_to_publish", () => {
    expect(() => assertCanTransition("topic_created", "ready_to_publish")).toThrow("Cannot transition");
  });

  it("maps each status to a next action", () => {
    expect(getNextAction("angles_generated")).toBe("选择一个写作角度");
  });

  it("identifies publish queue states", () => {
    expect(isPublishQueueStatus("ready_to_publish")).toBe(true);
    expect(isPublishQueueStatus("draft_generated")).toBe(false);
  });
});
