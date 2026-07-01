import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureAppDataReady: vi.fn()
}));

vi.mock("@/server/articles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/articles")>();
  return {
    ...actual,
    ensureAppDataReady: mocks.ensureAppDataReady
  };
});

import { POST } from "./route";

describe("POST /api/articles/[id]/render-html initialization errors", () => {
  beforeEach(() => {
    mocks.ensureAppDataReady.mockReset();
    mocks.ensureAppDataReady.mockImplementation(() => {
      throw new Error("数据库初始化失败");
    });
  });

  it("returns JSON when initialization fails", async () => {
    const response = await POST(new Request("http://localhost/api/test", { method: "POST" }) as never, {
      params: Promise.resolve({ id: "article-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toEqual({ error: "数据库初始化失败" });
  });
});
