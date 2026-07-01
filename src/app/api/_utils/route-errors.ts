import { NextResponse } from "next/server";
import { ZodError } from "zod";

type JsonErrorOptions = {
  status?: number;
  fallback?: string;
  validationFallback?: string;
  code?: string;
};

type JsonRouteHandler = () => Response | Promise<Response>;

export function jsonError(error: unknown, options: JsonErrorOptions = {}) {
  const isValidationError = error instanceof ZodError;
  const message =
    isValidationError
      ? options.validationFallback || error.issues[0]?.message || "输入不合法"
      : error instanceof Error
        ? error.message
        : options.fallback || "请求处理失败";

  return NextResponse.json(
    {
      error: message,
      ...(options.code ? { code: options.code } : {})
    },
    { status: isValidationError ? 400 : options.status ?? 400 }
  );
}

export function zodOrJsonError(error: unknown, fallback: string, status = 400) {
  return jsonError(error, {
    fallback,
    status
  });
}

export async function withJsonErrorBoundary(handler: JsonRouteHandler, options: JsonErrorOptions = {}) {
  try {
    return await handler();
  } catch (error) {
    return jsonError(error, options);
  }
}

export async function readOptionalJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
