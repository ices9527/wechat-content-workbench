import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { ensureAppDataReady, listDrafts, saveDraftInputSchema, saveDraftVersion, updateDraftInputSchema, updateDraftVersion } from "@/server/articles";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  const { id } = await params;
  return NextResponse.json({ drafts: listDrafts(id) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const input = saveDraftInputSchema.parse(await request.json());
    return NextResponse.json(saveDraftVersion(id, input), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "输入不合法" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存文案失败" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const input = updateDraftInputSchema.parse(await request.json());
    return NextResponse.json(updateDraftVersion(id, input));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "输入不合法" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存当前版本失败" }, { status: 400 });
  }
}
