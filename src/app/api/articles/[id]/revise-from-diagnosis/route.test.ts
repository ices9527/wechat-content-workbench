import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("/api/articles/[id]/revise-from-diagnosis legacy route", () => {
  it("returns a JSON gone response because diagnosis-based revision is no longer part of the workflow", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toEqual({ error: "基于 dbs-content 诊断生成修改稿已下线，请使用文案清洁检查生成清洁版文案。" });
  });
});
