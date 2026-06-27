import { describe, expect, it } from "vitest";

import { assertCanTransition, canTransition, getNextAction, isPublishQueueStatus } from "./status";

describe("article status machine", () => {
  it("allows the first writing transitions", () => {
    expect(canTransition("topic_created", "angles_generated")).toBe(true);
    expect(canTransition("angles_generated", "angle_selected")).toBe(true);
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
