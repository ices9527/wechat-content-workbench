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

import { DELETE, GET, PATCH, POST } from "./route";

async function expectInitializationJsonError(response: Response) {
  const body = await response.json();

  expect(response.status).toBe(500);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(body).toEqual({ error: "数据库初始化失败" });
}

describe("/api/requirements route initialization errors", () => {
  beforeEach(() => {
    mocks.ensureAppDataReady.mockReset();
    mocks.ensureAppDataReady.mockImplementation(() => {
      throw new Error("数据库初始化失败");
    });
  });

  it("returns JSON when list initialization fails", async () => {
    const response = await GET(new Request("http://localhost/api/requirements") as never);

    await expectInitializationJsonError(response);
  });

  it("returns JSON when create initialization fails", async () => {
    const response = await POST(new Request("http://localhost/api/requirements", { method: "POST" }) as never);

    await expectInitializationJsonError(response);
  });

  it("returns JSON when update initialization fails", async () => {
    const response = await PATCH(new Request("http://localhost/api/requirements?id=req-1", { method: "PATCH" }) as never);

    await expectInitializationJsonError(response);
  });

  it("returns JSON when delete initialization fails", async () => {
    const response = await DELETE(new Request("http://localhost/api/requirements?id=req-1", { method: "DELETE" }) as never);

    await expectInitializationJsonError(response);
  });
});
