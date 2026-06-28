"use client";

import { useMemo, useState } from "react";

import type { RequirementPreset } from "@/db/schema";
import type { RequirementStage } from "@/domain/stages";

export type RequirementEditorInput = {
  stage: RequirementStage;
  category: string;
  type: string;
  label: string;
  description: string;
  promptFragment: string;
  defaultEnabled: boolean;
  priority: number;
};

export function RequirementSelector({
  title,
  stage,
  requirements,
  selectedIds,
  onChange,
  pending,
  onCreate,
  onUpdate,
  onDelete
}: {
  title: string;
  stage: RequirementStage;
  requirements: RequirementPreset[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  pending: boolean;
  onCreate: (input: RequirementEditorInput) => Promise<void>;
  onUpdate: (id: string, input: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const activeRequirements = useMemo(
    () => requirements.filter((requirement) => requirement.enabled && !requirement.archivedAt),
    [requirements]
  );
  const categories = useMemo(
    () => Array.from(new Set(activeRequirements.map((requirement) => requirement.category))).sort((first, second) => first.localeCompare(second)),
    [activeRequirements]
  );
  const types = useMemo(
    () => Array.from(new Set(activeRequirements.map((requirement) => requirement.type))).sort((first, second) => first.localeCompare(second)),
    [activeRequirements]
  );
  const filteredRequirements = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return activeRequirements.filter((requirement) => {
      if (categoryFilter !== "all" && requirement.category !== categoryFilter) {
        return false;
      }
      if (typeFilter !== "all" && requirement.type !== typeFilter) {
        return false;
      }
      if (selectedOnly && !selectedIds.includes(requirement.id)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const searchable = [
        requirement.label,
        requirement.description,
        requirement.promptFragment,
        requirement.category,
        requirement.type
      ]
        .join("\n")
        .toLocaleLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [activeRequirements, categoryFilter, query, selectedIds, selectedOnly, typeFilter]);
  const grouped = useMemo(() => {
    const groups = new Map<string, RequirementPreset[]>();
    for (const requirement of filteredRequirements) {
      const current = groups.get(requirement.category) || [];
      current.push(requirement);
      groups.set(requirement.category, current);
    }
    return Array.from(groups.entries());
  }, [filteredRequirements]);

  function toggleRequirement(requirementId: string, checked: boolean) {
    if (checked) {
      onChange(Array.from(new Set([...selectedIds, requirementId])));
      return;
    }
    onChange(selectedIds.filter((id) => id !== requirementId));
  }

  return (
    <div className="requirement-selector">
      <div className="requirement-selector-head">
        <strong>{title}</strong>
        <span>
          {filteredRequirements.length} / {activeRequirements.length} 条可用
        </span>
      </div>
      <div className="requirement-selector-body">
        <div className="requirement-selector-toolbar">
          <input
            aria-label="搜索提示词"
            className="input"
            placeholder="搜索提示词"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            aria-label="按分类筛选提示词"
            className="input"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="all">全部分类</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select
            aria-label="按类型筛选提示词"
            className="input"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="all">全部类型</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <label className="check-field requirement-selected-only">
            <input checked={selectedOnly} onChange={(event) => setSelectedOnly(event.target.checked)} type="checkbox" />
            <span>只看已选</span>
          </label>
        </div>

        {activeRequirements.length === 0 ? (
          <p className="subtle">暂无可选提示词。</p>
        ) : filteredRequirements.length > 0 ? (
          grouped.map(([category, items]) => (
            <div className="requirement-group" key={category}>
              <p>{category}</p>
              <div className="requirement-options">
                {items.map((requirement) => (
                  <label className="requirement-option" key={requirement.id}>
                    <input
                      checked={selectedIds.includes(requirement.id)}
                      onChange={(event) => toggleRequirement(requirement.id, event.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <strong>{requirement.label}</strong>
                      <small>{requirement.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="subtle">没有匹配的可选提示词。</p>
        )}

        <details className="requirement-manager-inline">
          <summary>管理可选提示词</summary>
          <div className="requirement-manager-body">
            <form
              className="requirement-edit-form"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                void onCreate({
                  stage,
                  category: String(formData.get("category") || "自定义"),
                  type: String(formData.get("type") || "prefer"),
                  label: String(formData.get("label") || ""),
                  description: String(formData.get("description") || ""),
                  promptFragment: String(formData.get("promptFragment") || ""),
                  defaultEnabled: formData.get("defaultEnabled") === "on",
                  priority: Number(formData.get("priority") || 500)
                });
                event.currentTarget.reset();
              }}
            >
              <input className="input" name="label" placeholder="标签" required />
              <input className="input" name="category" placeholder="分类" defaultValue="自定义" required />
              <select className="input" name="type" defaultValue="prefer" aria-label="可选提示词类型">
                <option value="must">must</option>
                <option value="avoid">avoid</option>
                <option value="prefer">prefer</option>
                <option value="check">check</option>
                <option value="compliance">compliance</option>
              </select>
              <input className="input" name="priority" type="number" min="0" max="9999" defaultValue="500" aria-label="排序" />
              <input className="input span-2" name="description" placeholder="说明" />
              <textarea className="textarea prompt-textarea span-2" name="promptFragment" placeholder="提示词片段" required />
              <label className="check-field">
                <input name="defaultEnabled" type="checkbox" />
                <span>默认勾选</span>
              </label>
              <button className="button secondary" disabled={pending} type="submit">
                新增
              </button>
            </form>

            <div className="requirement-manager-list">
              {requirements.map((requirement) => (
                <details className="requirement-edit-item" key={requirement.id}>
                  <summary>
                    <span>{requirement.label}</span>
                    <small>{requirement.archivedAt ? "已归档" : requirement.enabled ? "启用" : "停用"}</small>
                  </summary>
                  <form
                    className="requirement-edit-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      void onUpdate(requirement.id, {
                        stage,
                        category: String(formData.get("category") || requirement.category),
                        type: String(formData.get("type") || requirement.type),
                        label: String(formData.get("label") || requirement.label),
                        description: String(formData.get("description") || requirement.description),
                        promptFragment: String(formData.get("promptFragment") || requirement.promptFragment),
                        defaultEnabled: formData.get("defaultEnabled") === "on",
                        priority: Number(formData.get("priority") || requirement.priority)
                      });
                    }}
                  >
                    <input className="input" name="label" defaultValue={requirement.label} required />
                    <input className="input" name="category" defaultValue={requirement.category} required />
                    <select className="input" name="type" defaultValue={requirement.type} aria-label="可选提示词类型">
                      <option value="must">must</option>
                      <option value="avoid">avoid</option>
                      <option value="prefer">prefer</option>
                      <option value="check">check</option>
                      <option value="compliance">compliance</option>
                    </select>
                    <input className="input" name="priority" type="number" min="0" max="9999" defaultValue={requirement.priority} aria-label="排序" />
                    <input className="input span-2" name="description" defaultValue={requirement.description} />
                    <textarea className="textarea prompt-textarea span-2" name="promptFragment" defaultValue={requirement.promptFragment} required />
                    <label className="check-field">
                      <input name="defaultEnabled" type="checkbox" defaultChecked={requirement.defaultEnabled} />
                      <span>默认勾选</span>
                    </label>
                    <div className="action-row compact">
                      <button className="button secondary" disabled={pending} type="submit">
                        保存
                      </button>
                      <button
                        className="button secondary"
                        disabled={pending}
                        onClick={() => void onUpdate(requirement.id, { enabled: !requirement.enabled, archived: false })}
                        type="button"
                      >
                        {requirement.enabled ? "停用" : "恢复"}
                      </button>
                      <button
                        className="button secondary"
                        disabled={pending}
                        onClick={() => void onUpdate(requirement.id, { enabled: false, archived: true })}
                        type="button"
                      >
                        归档
                      </button>
                      <button className="button secondary" disabled={pending} onClick={() => void onDelete(requirement.id)} type="button">
                        删除
                      </button>
                    </div>
                  </form>
                </details>
              ))}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
