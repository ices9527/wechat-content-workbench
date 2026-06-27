import { describe, expect, it } from "vitest";

import { assertAiConfig, databaseUrlToPath, readAppConfig } from "./env";

describe("app config", () => {
  it("uses the local SQLite database by default", () => {
    const config = readAppConfig({});
    expect(config.databaseUrl).toBe("file:./data/workbench.sqlite");
  });

  it("requires an AI model before AI tasks", () => {
    const config = readAppConfig({ OPENAI_API_KEY: "secret" });
    expect(() => assertAiConfig(config)).toThrow("OPENAI_MODEL");
  });

  it("resolves relative file database URLs", () => {
    expect(databaseUrlToPath("file:./data/workbench.sqlite", "/tmp/app")).toBe("/tmp/app/data/workbench.sqlite");
  });
});
