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

async function expectInitializationJsonError(response: Response) {
  const body = await response.json();

  expect(response.status).toBe(500);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(body).toEqual({ error: "数据库初始化失败" });
}

function params(id = "article-1") {
  return { params: Promise.resolve({ id }) };
}

describe("/api/articles/[id]/run-ai-style-check route initialization errors", () => {
  beforeEach(() => {
    mocks.ensureAppDataReady.mockReset();
    mocks.ensureAppDataReady.mockImplementation(() => {
      throw new Error("数据库初始化失败");
    });
  });

  it("returns JSON when run initialization fails", async () => {
    const response = await POST(
      new Request("http://localhost/api/articles/article-1/run-ai-style-check", { method: "POST" }) as never,
      params()
    );

    await expectInitializationJsonError(response);
  });
});
