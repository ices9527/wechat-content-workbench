import { NextRequest, NextResponse } from "next/server";

import { zodOrJsonError } from "@/app/api/_utils/route-errors";
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
    return zodOrJsonError(error, "保存文案失败");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const input = updateDraftInputSchema.parse(await request.json());
    return NextResponse.json(updateDraftVersion(id, input));
  } catch (error) {
    return zodOrJsonError(error, "保存当前版本失败");
  }
}
