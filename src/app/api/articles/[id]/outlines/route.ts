import { NextRequest, NextResponse } from "next/server";

import { withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, listOutlines, saveOutlineInputSchema, saveOutlineVersion, updateOutlineInputSchema, updateOutlineVersion } from "@/server/articles";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    const { id } = await params;
    return NextResponse.json({ outlines: listOutlines(id) });
  }, { fallback: "读取提纲版本失败", status: 500 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const input = saveOutlineInputSchema.parse(await request.json());
      return NextResponse.json(saveOutlineVersion(id, input), { status: 201 });
    } catch (error) {
      return zodOrJsonError(error, "保存提纲失败");
    }
  }, { fallback: "保存提纲失败", status: 500 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const input = updateOutlineInputSchema.parse(await request.json());
      return NextResponse.json(updateOutlineVersion(id, input));
    } catch (error) {
      return zodOrJsonError(error, "保存当前提纲失败");
    }
  }, { fallback: "保存当前提纲失败", status: 500 });
}
