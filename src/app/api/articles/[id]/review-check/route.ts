import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { ensureAppDataReady, reviewCheckInputSchema, runReviewCheck } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const payload = await request.json().catch(() => ({}));
    const input = reviewCheckInputSchema.parse(payload);
    return NextResponse.json(await runReviewCheck(id, input), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "输入不合法" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成复盘检查清单失败" }, { status: 400 });
  }
}
