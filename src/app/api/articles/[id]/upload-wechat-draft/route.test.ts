import type { WechatDraftUpload } from "@/db/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureAppDataReady: vi.fn(),
  uploadWechatDraft: vi.fn()
}));

vi.mock("@/server/articles", () => ({
  ensureAppDataReady: mocks.ensureAppDataReady
}));

vi.mock("@/server/publishing", () => ({
  uploadWechatDraft: mocks.uploadWechatDraft
}));

import { POST } from "./route";

function uploadFixture(overrides: Partial<WechatDraftUpload> = {}): WechatDraftUpload {
  return {
    id: "upload-1",
    articleId: "article-1",
    ownerId: "owner-1",
    draftVersionId: "draft-1",
    coverAssetId: "cover-1",
    htmlAssetId: "html-1",
    wechatMediaId: null,
    wechatArticleUrl: null,
    status: "success",
    errorMessage: null,
    uploadedAt: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

function postForArticle(articleId = "article-1") {
  return POST(new Request("http://localhost/api/test", { method: "POST" }) as never, {
    params: Promise.resolve({ id: articleId })
  });
}

describe("POST /api/articles/[id]/upload-wechat-draft", () => {
  beforeEach(() => {
    mocks.ensureAppDataReady.mockReset();
    mocks.uploadWechatDraft.mockReset();
  });

  it("returns the upload on success", async () => {
    const upload = uploadFixture({ wechatMediaId: "media-1" });
    mocks.uploadWechatDraft.mockResolvedValue(upload);

    const response = await postForArticle();
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual(upload);
  });

  it("returns error and failed upload when the adapter records a failure", async () => {
    const upload = uploadFixture({
      status: "failed",
      errorMessage: "微信接口失败",
      uploadedAt: "2026-07-01T01:00:00.000Z"
    });
    mocks.uploadWechatDraft.mockResolvedValue(upload);

    const response = await postForArticle();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ error: "微信接口失败", upload });
  });

  it("returns a readable JSON error when upload preconditions fail", async () => {
    mocks.uploadWechatDraft.mockRejectedValue(new Error("请先生成 HTML 和封面"));

    const response = await postForArticle();
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "请先生成 HTML 和封面" });
  });

  it("returns JSON when initialization fails", async () => {
    mocks.ensureAppDataReady.mockImplementation(() => {
      throw new Error("数据库初始化失败");
    });

    const response = await postForArticle();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toEqual({ error: "数据库初始化失败" });
  });
});
