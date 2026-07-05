import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { requirementStageSchema, type RequirementStage } from "@/domain/stages";
import { getDatabase, type WorkbenchDatabase } from "@/db/client";
import { LOCAL_USER_ID } from "@/db/seed";
import { requirementPresets, type RequirementPreset } from "@/db/schema";

import { REQUIREMENT_PROMPT_FRAGMENT_MAX_LENGTH } from "./prompt-limits";

export const requirementTypeSchema = z.enum(["must", "avoid", "prefer", "check", "compliance"]);

export const createRequirementInputSchema = z.object({
  stage: requirementStageSchema,
  category: z.string().trim().min(1, "分类不能为空").max(40, "分类不能超过 40 字"),
  type: requirementTypeSchema,
  label: z.string().trim().min(1, "标签不能为空").max(80, "标签不能超过 80 字"),
  description: z.string().trim().max(240, "说明不能超过 240 字").optional(),
  promptFragment: z.string().trim().min(1, "提示词不能为空").max(REQUIREMENT_PROMPT_FRAGMENT_MAX_LENGTH, `提示词不能超过 ${REQUIREMENT_PROMPT_FRAGMENT_MAX_LENGTH} 字`),
  defaultEnabled: z.boolean().optional().default(false),
  priority: z.coerce.number().int().min(0).max(9999).optional().default(500)
});

export const updateRequirementInputSchema = z.object({
  stage: requirementStageSchema.optional(),
  category: z.string().trim().min(1, "分类不能为空").max(40, "分类不能超过 40 字").optional(),
  type: requirementTypeSchema.optional(),
  label: z.string().trim().min(1, "标签不能为空").max(80, "标签不能超过 80 字").optional(),
  description: z.string().trim().max(240, "说明不能超过 240 字").optional(),
  promptFragment: z.string().trim().min(1, "提示词不能为空").max(REQUIREMENT_PROMPT_FRAGMENT_MAX_LENGTH, `提示词不能超过 ${REQUIREMENT_PROMPT_FRAGMENT_MAX_LENGTH} 字`).optional(),
  defaultEnabled: z.boolean().optional(),
  enabled: z.boolean().optional(),
  archived: z.boolean().optional(),
  priority: z.coerce.number().int().min(0).max(9999).optional()
});

export type CreateRequirementInput = z.infer<typeof createRequirementInputSchema>;
export type UpdateRequirementInput = z.infer<typeof updateRequirementInputSchema>;

export function listRequirementPresets(
  input: { stage?: RequirementStage; includeArchived?: boolean } = {},
  db: WorkbenchDatabase = getDatabase().db
): RequirementPreset[] {
  const parsedStage = input.stage ? requirementStageSchema.parse(input.stage) : undefined;
  const conditions = [eq(requirementPresets.ownerId, LOCAL_USER_ID)];

  if (parsedStage) {
    conditions.push(eq(requirementPresets.stage, parsedStage));
  }
  if (!input.includeArchived) {
    conditions.push(eq(requirementPresets.enabled, true));
    conditions.push(isNull(requirementPresets.archivedAt));
  }

  return db
    .select()
    .from(requirementPresets)
    .where(and(...conditions))
    .orderBy(asc(requirementPresets.stage), asc(requirementPresets.category), asc(requirementPresets.priority))
    .all();
}

export function resolveSelectedRequirements(
  ids: string[] | undefined,
  stage: RequirementStage,
  db: WorkbenchDatabase = getDatabase().db
): RequirementPreset[] {
  const parsedStage = requirementStageSchema.parse(stage);
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));

  if (uniqueIds.length === 0) {
    return [];
  }

  const rows = db
    .select()
    .from(requirementPresets)
    .where(and(eq(requirementPresets.ownerId, LOCAL_USER_ID), inArray(requirementPresets.id, uniqueIds)))
    .orderBy(asc(requirementPresets.priority))
    .all();

  if (rows.length !== uniqueIds.length) {
    throw new Error("可选提示词不存在");
  }

  const invalid = rows.find((row) => row.stage !== parsedStage || !row.enabled || row.archivedAt);
  if (invalid) {
    throw new Error("可选提示词不适用于当前阶段");
  }

  return rows;
}

export function createRequirementPreset(
  input: CreateRequirementInput,
  db: WorkbenchDatabase = getDatabase().db
): RequirementPreset {
  const parsed = createRequirementInputSchema.parse(input);
  const now = new Date().toISOString();
  const requirement: RequirementPreset = {
    id: randomUUID(),
    stableKey: `USER-${randomUUID()}`,
    ownerId: LOCAL_USER_ID,
    stage: parsed.stage,
    category: parsed.category,
    type: parsed.type,
    label: parsed.label,
    description: parsed.description || parsed.label,
    promptFragment: parsed.promptFragment,
    defaultEnabled: parsed.defaultEnabled,
    enabled: true,
    priority: parsed.priority,
    source: "user",
    archivedAt: null,
    createdAt: now,
    updatedAt: now
  };
  db.insert(requirementPresets).values(requirement).run();
  return requirement;
}

function requireRequirementPreset(id: string, db: WorkbenchDatabase): RequirementPreset {
  const requirement = db
    .select()
    .from(requirementPresets)
    .where(and(eq(requirementPresets.id, id), eq(requirementPresets.ownerId, LOCAL_USER_ID)))
    .get();
  if (!requirement) {
    throw new Error("可选提示词不存在");
  }
  return requirement;
}

export function updateRequirementPreset(
  id: string,
  input: UpdateRequirementInput,
  db: WorkbenchDatabase = getDatabase().db
): RequirementPreset {
  const existing = requireRequirementPreset(id, db);
  const parsed = updateRequirementInputSchema.parse(input);
  const now = new Date().toISOString();
  const values = {
    stage: parsed.stage ?? existing.stage,
    category: parsed.category ?? existing.category,
    type: parsed.type ?? existing.type,
    label: parsed.label ?? existing.label,
    description: parsed.description ?? existing.description,
    promptFragment: parsed.promptFragment ?? existing.promptFragment,
    defaultEnabled: parsed.defaultEnabled ?? existing.defaultEnabled,
    enabled: parsed.enabled ?? existing.enabled,
    priority: parsed.priority ?? existing.priority,
    archivedAt: parsed.archived === undefined ? existing.archivedAt : parsed.archived ? now : null,
    updatedAt: now
  };

  db.update(requirementPresets).set(values).where(eq(requirementPresets.id, existing.id)).run();
  return { ...existing, ...values };
}

export function deleteRequirementPreset(
  id: string,
  db: WorkbenchDatabase = getDatabase().db
): { deleted: boolean; archived: boolean; requirement: RequirementPreset } {
  const existing = requireRequirementPreset(id, db);
  const archived = updateRequirementPreset(
    existing.id,
    {
      enabled: false,
      archived: true
    },
    db
  );
  return { deleted: false, archived: true, requirement: archived };
}
