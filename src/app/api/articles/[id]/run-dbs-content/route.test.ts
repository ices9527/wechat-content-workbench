import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("/api/articles/[id]/run-dbs-content legacy route", () => {
  it("returns a JSON gone response because dbs-content is no longer part of the workflow", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toEqual({ error: "dbs-content 已下线，请使用文案清洁检查。" });
  });
});
