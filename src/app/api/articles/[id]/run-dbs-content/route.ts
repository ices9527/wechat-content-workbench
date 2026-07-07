import { NextResponse } from "next/server";

const LEGACY_DBS_CONTENT_DISABLED_MESSAGE = "dbs-content 已下线，请使用文案清洁检查。";

export async function POST() {
  return NextResponse.json({ error: LEGACY_DBS_CONTENT_DISABLED_MESSAGE }, { status: 410 });
}
