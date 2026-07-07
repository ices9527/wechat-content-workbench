"use client";

import { ArrowRight, RotateCcw } from "lucide-react";

import type { QualityGateReworkItem, QualityGateReworkTabId } from "@/domain/quality-gate-rework";

export function QualityGateReworkCard({
  items,
  onJumpToTab
}: {
  items: QualityGateReworkItem[];
  onJumpToTab: (tabId: QualityGateReworkTabId) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  const blockingCount = items.filter((item) => item.blockingLevel === "block").length;

  return (
    <section aria-label="质量门回流建议" className="quality-rework-card">
      <div className="quality-rework-head">
        <div className="quality-rework-title-row">
          <span aria-hidden="true" className="quality-rework-icon">
            <RotateCcw size={17} />
          </span>
          <div>
            <h2>需要回到上游处理</h2>
            <p>
              {blockingCount > 0 ? `${blockingCount} 条会阻断继续推进。` : "这些建议不会自动修改内容，需要你回到对应节点确认。"}
            </p>
          </div>
        </div>
        <span className="quality-rework-count">{items.length} 条建议</span>
      </div>
      <div className="quality-rework-list">
        {items.map((item) => (
          <article className="quality-rework-item" key={item.id}>
            <div className="quality-rework-item-main">
              <p className="quality-rework-meta">
                {item.sourceLabel} 发现 · 回到 {item.targetLabel}
              </p>
              <h3>{item.checkLabel}</h3>
              <p>{item.reason}</p>
              <p className="quality-rework-suggestion">{item.suggestedAction}</p>
            </div>
            <button className="button secondary compact-button quality-rework-action" onClick={() => onJumpToTab(item.targetTab)} type="button">
              <ArrowRight aria-hidden="true" size={16} />
              回到{item.targetLabel}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
