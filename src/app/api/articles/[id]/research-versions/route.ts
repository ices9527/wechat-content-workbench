import { NextRequest, NextResponse } from "next/server";

import { ensureAppDataReady, listResearchVersions } from "@/server/articles";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  const { id } = await params;
  return NextResponse.json({ researchVersions: listResearchVersions(id) });
}
