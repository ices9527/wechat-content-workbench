import path from "node:path";
import { z } from "zod";

const appConfigSchema = z.object({
  databaseUrl: z.string().default("file:./data/workbench.sqlite"),
  openaiApiKey: z.string().optional(),
  openaiBaseUrl: z.string().optional(),
  openaiModel: z.string().optional(),
  wechatAppId: z.string().optional(),
  wechatAppSecret: z.string().optional(),
  wechatAuthor: z.string().optional(),
  wechatApiBase: z.string().optional()
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export function readAppConfig(env: Partial<NodeJS.ProcessEnv> = process.env): AppConfig {
  return appConfigSchema.parse({
    databaseUrl: env.DATABASE_URL,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiBaseUrl: env.OPENAI_BASE_URL,
    openaiModel: env.OPENAI_MODEL,
    wechatAppId: env.WECHAT_APP_ID,
    wechatAppSecret: env.WECHAT_APP_SECRET,
    wechatAuthor: env.WECHAT_AUTHOR,
    wechatApiBase: env.WECHAT_API_BASE
  });
}

export function assertAiConfig(config: AppConfig): void {
  if (!config.openaiModel) {
    throw new Error("OPENAI_MODEL is required before running AI tasks.");
  }
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required before running AI tasks.");
  }
}

export function assertWechatConfig(config: AppConfig): asserts config is AppConfig & {
  wechatAppId: string;
  wechatAppSecret: string;
} {
  if (!config.wechatAppId) {
    throw new Error("WECHAT_APP_ID is required before uploading WeChat drafts.");
  }
  if (!config.wechatAppSecret) {
    throw new Error("WECHAT_APP_SECRET is required before uploading WeChat drafts.");
  }
}

export function databaseUrlToPath(databaseUrl: string, cwd = process.cwd()): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("Only file: SQLite DATABASE_URL values are supported.");
  }

  const filePath = databaseUrl.slice("file:".length);
  return path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
}
