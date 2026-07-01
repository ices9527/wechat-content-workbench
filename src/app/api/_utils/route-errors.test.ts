import { describe, expect, it } from "vitest";
import { z } from "zod";

import { jsonError, readOptionalJson, withJsonErrorBoundary, zodOrJsonError } from "./route-errors";

describe("route error helpers", () => {
  it("returns JSON errors without exposing stack traces", async () => {
    const response = jsonError(new Error("文章不存在"), { status: 404, code: "ARTICLE_NOT_FOUND" });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "文章不存在", code: "ARTICLE_NOT_FOUND" });
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("normalizes zod validation errors", async () => {
    const parsed = z.object({ title: z.string().min(1, "标题必填") }).safeParse({ title: "" });
    if (parsed.success) {
      throw new Error("expected validation to fail");
    }

    const response = zodOrJsonError(parsed.error, "创建文章失败");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("标题必填");
  });

  it("keeps validation errors as 400 even when fallback status is server error", async () => {
    const parsed = z.object({ id: z.string().uuid("ID 不合法") }).safeParse({ id: "bad" });
    if (parsed.success) {
      throw new Error("expected validation to fail");
    }

    const response = zodOrJsonError(parsed.error, "创建文章失败", 500);

    expect(response.status).toBe(400);
  });

  it("wraps initialization failures as JSON responses", async () => {
    const response = await withJsonErrorBoundary(
      () => {
        throw new Error("数据库初始化失败");
      },
      { fallback: "初始化失败", status: 500 }
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toEqual({ error: "数据库初始化失败" });
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("uses an empty object when optional JSON bodies are missing or invalid", async () => {
    const request = new Request("http://localhost/api/test", { method: "POST", body: "" });

    await expect(readOptionalJson(request)).resolves.toEqual({});
  });
});
