import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { ensureAppDataReady, runDbsContent, runDbsContentInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const input = runDbsContentInputSchema.parse(await request.json());
    return NextResponse.json(await runDbsContent(id, input), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "输入不合法" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "dbs-content 诊断失败" }, { status: 400 });
  }
}
