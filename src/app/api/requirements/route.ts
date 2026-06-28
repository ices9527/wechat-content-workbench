import { NextRequest, NextResponse } from "next/server";

import { jsonError, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { requirementStageSchema } from "@/domain/stages";
import { ensureAppDataReady } from "@/server/articles";
import {
  createRequirementInputSchema,
  createRequirementPreset,
  deleteRequirementPreset,
  listRequirementPresets,
  updateRequirementInputSchema,
  updateRequirementPreset
} from "@/server/requirements";

export async function GET(request: NextRequest) {
  ensureAppDataReady();
  try {
    const stageParam = request.nextUrl.searchParams.get("stage");
    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";
    const stage = stageParam ? requirementStageSchema.parse(stageParam) : undefined;
    return NextResponse.json({ requirements: listRequirementPresets({ stage, includeArchived }) });
  } catch (error) {
    return jsonError(error, { fallback: "读取可选提示词失败", validationFallback: "阶段不合法" });
  }
}

export async function POST(request: NextRequest) {
  ensureAppDataReady();
  try {
    const input = createRequirementInputSchema.parse(await request.json());
    return NextResponse.json(createRequirementPreset(input), { status: 201 });
  } catch (error) {
    return zodOrJsonError(error, "新增可选提示词失败");
  }
}

export async function PATCH(request: NextRequest) {
  ensureAppDataReady();
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return jsonError(new Error("必须指定可选提示词"));
    }
    const input = updateRequirementInputSchema.parse(await request.json());
    return NextResponse.json(updateRequirementPreset(id, input));
  } catch (error) {
    return zodOrJsonError(error, "更新可选提示词失败");
  }
}

export async function DELETE(request: NextRequest) {
  ensureAppDataReady();
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return jsonError(new Error("必须指定可选提示词"));
    }
    return NextResponse.json(deleteRequirementPreset(id));
  } catch (error) {
    return zodOrJsonError(error, "删除可选提示词失败");
  }
}
