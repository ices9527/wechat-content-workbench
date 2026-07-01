import { NextRequest, NextResponse } from "next/server";

import { withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, listDrafts, saveDraftInputSchema, saveDraftVersion, updateDraftInputSchema, updateDraftVersion } from "@/server/articles";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    const { id } = await params;
    return NextResponse.json({ drafts: listDrafts(id) });
  }, { fallback: "读取文案版本失败", status: 500 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const input = saveDraftInputSchema.parse(await request.json());
      return NextResponse.json(saveDraftVersion(id, input), { status: 201 });
    } catch (error) {
      return zodOrJsonError(error, "保存文案失败");
    }
  }, { fallback: "保存文案失败", status: 500 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const input = updateDraftInputSchema.parse(await request.json());
      return NextResponse.json(updateDraftVersion(id, input));
    } catch (error) {
      return zodOrJsonError(error, "保存当前版本失败");
    }
  }, { fallback: "保存当前版本失败", status: 500 });
}
