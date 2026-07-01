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

import { GET, POST } from "./route";

async function expectInitializationJsonError(response: Response) {
  const body = await response.json();

  expect(response.status).toBe(500);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(body).toEqual({ error: "数据库初始化失败" });
}

function params(id = "article-1") {
  return { params: Promise.resolve({ id }) };
}

describe("/api/articles/[id]/angles route initialization errors", () => {
  beforeEach(() => {
    mocks.ensureAppDataReady.mockReset();
    mocks.ensureAppDataReady.mockImplementation(() => {
      throw new Error("数据库初始化失败");
    });
  });

  it("returns JSON when list initialization fails", async () => {
    const response = await GET(new Request("http://localhost/api/articles/article-1/angles") as never, params());

    await expectInitializationJsonError(response);
  });

  it("returns JSON when manual create initialization fails", async () => {
    const response = await POST(
      new Request("http://localhost/api/articles/article-1/angles", { method: "POST" }) as never,
      params()
    );

    await expectInitializationJsonError(response);
  });
});
