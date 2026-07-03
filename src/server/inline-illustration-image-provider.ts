import type { InlineIllustrationClient, InlineIllustrationClientInput, InlineIllustrationClientResult } from "./inline-illustrations";

export const OPENAI_IMAGE_INLINE_ILLUSTRATION_PROVIDER = "openai_image_inline_illustration";

type FetchLike = typeof fetch;

export type OpenAIImageInlineIllustrationClientConfig = {
  apiKey?: string;
  baseUrl?: string;
  endpointPath?: string;
  model?: string;
  size?: string;
  fetchImpl?: FetchLike;
};

type ImageApiDataItem = {
  b64_json?: unknown;
  url?: unknown;
};

type ImageApiResponse = {
  data?: unknown;
  error?: {
    message?: unknown;
  };
};

const DEFAULT_IMAGE_API_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_IMAGE_API_ENDPOINT_PATH = "/images/generations";

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function joinUrl(baseUrl: string, endpointPath: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${endpointPath.replace(/^\/+/, "")}`;
}

function imageSize(input: InlineIllustrationClientInput, configuredSize: string | undefined): string {
  return configuredSize || `${input.width}x${input.height}`;
}

function requireValue(value: string | undefined, message: string): string {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

async function parseJsonResponse(response: Response): Promise<ImageApiResponse> {
  try {
    return (await response.json()) as ImageApiResponse;
  } catch {
    throw new Error("真实正文配图 provider 返回了无法解析的 JSON");
  }
}

function normalizeImageMimeType(value: string | null | undefined): "image/png" | "image/jpeg" {
  const normalized = value?.split(";")[0]?.trim().toLowerCase();
  if (normalized === "image/jpeg" || normalized === "image/jpg") {
    return "image/jpeg";
  }
  return "image/png";
}

function imageFromBase64(value: string): { content: Buffer; mimeType: "image/png" | "image/jpeg" } {
  const dataUrl = value.match(/^data:(image\/(?:png|jpe?g));base64,(.+)$/i);
  if (dataUrl) {
    return {
      content: Buffer.from(dataUrl[2] || "", "base64"),
      mimeType: normalizeImageMimeType(dataUrl[1])
    };
  }
  return {
    content: Buffer.from(value, "base64"),
    mimeType: "image/png"
  };
}

function firstImageData(payload: ImageApiResponse): ImageApiDataItem {
  if (!Array.isArray(payload.data) || payload.data.length === 0 || typeof payload.data[0] !== "object" || payload.data[0] === null) {
    throw new Error("真实正文配图 provider 没有返回图片数据");
  }
  return payload.data[0] as ImageApiDataItem;
}

export function openAIImageInlineIllustrationClientFromEnv(fetchImpl?: FetchLike): OpenAIImageInlineIllustrationClient {
  return new OpenAIImageInlineIllustrationClient({
    apiKey: trimOptional(process.env.INLINE_ILLUSTRATION_IMAGE_API_KEY) || trimOptional(process.env.IMAGE_API_KEY) || trimOptional(process.env.OPENAI_API_KEY),
    baseUrl:
      trimOptional(process.env.INLINE_ILLUSTRATION_IMAGE_BASE_URL) ||
      trimOptional(process.env.IMAGE_API_BASE_URL) ||
      trimOptional(process.env.OPENAI_BASE_URL),
    endpointPath: trimOptional(process.env.INLINE_ILLUSTRATION_IMAGE_ENDPOINT_PATH),
    model: trimOptional(process.env.INLINE_ILLUSTRATION_IMAGE_MODEL) || trimOptional(process.env.IMAGE_MODEL),
    size: trimOptional(process.env.INLINE_ILLUSTRATION_IMAGE_SIZE),
    fetchImpl
  });
}

export class OpenAIImageInlineIllustrationClient implements InlineIllustrationClient {
  provider = OPENAI_IMAGE_INLINE_ILLUSTRATION_PROVIDER;

  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly endpointPath: string;
  private readonly model?: string;
  private readonly configuredSize?: string;
  private readonly fetchImpl: FetchLike;

  constructor(config: OpenAIImageInlineIllustrationClientConfig = {}) {
    this.apiKey = trimOptional(config.apiKey);
    this.baseUrl = trimOptional(config.baseUrl) || DEFAULT_IMAGE_API_BASE_URL;
    this.endpointPath = trimOptional(config.endpointPath) || DEFAULT_IMAGE_API_ENDPOINT_PATH;
    this.model = trimOptional(config.model);
    this.configuredSize = trimOptional(config.size);
    this.fetchImpl = config.fetchImpl || fetch;
  }

  async generate(input: InlineIllustrationClientInput): Promise<InlineIllustrationClientResult> {
    const apiKey = requireValue(this.apiKey, "缺少 INLINE_ILLUSTRATION_IMAGE_API_KEY、IMAGE_API_KEY 或 OPENAI_API_KEY，无法调用真实正文配图 provider");
    const model = requireValue(this.model, "缺少 INLINE_ILLUSTRATION_IMAGE_MODEL 或 IMAGE_MODEL，无法调用真实正文配图 provider");

    const response = await this.fetchImpl(joinUrl(this.baseUrl, this.endpointPath), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt: input.prompt,
        size: imageSize(input, this.configuredSize),
        n: 1,
        response_format: "b64_json"
      })
    });

    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      const message = typeof payload.error?.message === "string" ? payload.error.message : `HTTP ${response.status}`;
      throw new Error(`真实正文配图 provider 调用失败：${message}`);
    }

    const data = firstImageData(payload);
    if (typeof data.b64_json === "string" && data.b64_json.trim()) {
      const image = imageFromBase64(data.b64_json);
      return {
        content: image.content,
        mimeType: image.mimeType,
        provider: this.provider,
        width: input.width,
        height: input.height,
        prompt: input.prompt
      };
    }

    if (typeof data.url === "string" && data.url.trim()) {
      const imageResponse = await this.fetchImpl(data.url);
      if (!imageResponse.ok) {
        throw new Error(`真实正文配图 provider 图片下载失败：HTTP ${imageResponse.status}`);
      }
      return {
        content: Buffer.from(await imageResponse.arrayBuffer()),
        mimeType: normalizeImageMimeType(imageResponse.headers.get("content-type")),
        provider: this.provider,
        width: input.width,
        height: input.height,
        prompt: input.prompt
      };
    }

    throw new Error("真实正文配图 provider 没有返回 b64_json 或 url");
  }
}
