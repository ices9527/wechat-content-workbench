import { describe, expect, it } from "vitest";

import { assertAiConfig, assertWechatConfig, databaseUrlToPath, readAppConfig } from "./env";

describe("app config", () => {
  it("uses the local SQLite database by default", () => {
    const config = readAppConfig({});
    expect(config.databaseUrl).toBe("file:./data/workbench.sqlite");
  });

  it("requires an AI model before AI tasks", () => {
    const config = readAppConfig({ OPENAI_API_KEY: "secret" });
    expect(() => assertAiConfig(config)).toThrow("OPENAI_MODEL");
  });

  it("requires WeChat app credentials before real draft uploads", () => {
    const config = readAppConfig({ WECHAT_APP_ID: "app-id" });
    expect(() => assertWechatConfig(config)).toThrow("WECHAT_APP_SECRET");
  });

  it("resolves relative file database URLs", () => {
    expect(databaseUrlToPath("file:./data/workbench.sqlite", "/tmp/app")).toBe("/tmp/app/data/workbench.sqlite");
  });
});
