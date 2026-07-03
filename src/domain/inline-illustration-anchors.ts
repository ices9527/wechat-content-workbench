export type InlineIllustrationAnchorMatchType = "heading" | "paragraph" | "list_item" | "none";
export type InlineIllustrationPlacement = "before" | "after";
export type InlineIllustrationPositionStatus = "matched" | "fallback" | "unmatched";

export type MarkdownAnchor = {
  anchor: string;
  line: string;
  lineIndex: number;
  matchType: Exclude<InlineIllustrationAnchorMatchType, "none">;
};

export type InlineIllustrationPositionOption = {
  id: string;
  anchor: string;
  line: string;
  lineIndex: number;
  matchType: Exclude<InlineIllustrationAnchorMatchType, "none">;
  label: string;
  positionBefore: string;
  positionAfter: string;
};

export type InlineIllustrationPositionResolution = {
  status: InlineIllustrationPositionStatus;
  anchor: string;
  placement: InlineIllustrationPlacement;
  matchedLine: string | null;
  lineIndex: number | null;
  matchType: InlineIllustrationAnchorMatchType;
  warning: string | null;
};

type PositionCandidate = {
  anchor: string;
  preferredMatchTypes: Exclude<InlineIllustrationAnchorMatchType, "none">[];
  priority: number;
};

const QUOTED_ANCHOR_PATTERN = /[“"「《]([^”"」》]+)[”"」》]/g;
const DEFAULT_POSITION_OPTION_ANCHOR_LENGTH = 42;

export function normalizeInlineIllustrationAnchor(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function markdownLineToAnchor(rawLine: string, lineIndex: number): MarkdownAnchor | null {
  const line = rawLine.trim();
  if (!line) {
    return null;
  }

  const heading = line.match(/^(#{1,6})\s+(.+)$/);
  if (heading) {
    return {
      anchor: normalizeInlineIllustrationAnchor(heading[2]),
      line,
      lineIndex,
      matchType: "heading"
    };
  }

  const listItem = line.match(/^[-*+]\s+(.+)$/);
  if (listItem) {
    return {
      anchor: normalizeInlineIllustrationAnchor(listItem[1]),
      line,
      lineIndex,
      matchType: "list_item"
    };
  }

  return {
    anchor: normalizeInlineIllustrationAnchor(line),
    line,
    lineIndex,
    matchType: "paragraph"
  };
}

export function extractMarkdownAnchors(markdown: string): MarkdownAnchor[] {
  return markdown
    .split(/\r?\n/)
    .map((line, lineIndex) => markdownLineToAnchor(line, lineIndex))
    .filter((anchor): anchor is MarkdownAnchor => Boolean(anchor));
}

function truncateAnchorForPosition(anchor: string, maxLength = DEFAULT_POSITION_OPTION_ANCHOR_LENGTH): string {
  const normalized = normalizeInlineIllustrationAnchor(anchor);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, maxLength).trim();
}

function formatPositionOptionLabel(anchor: MarkdownAnchor): string {
  const prefix =
    anchor.matchType === "heading"
      ? "标题"
      : anchor.matchType === "list_item"
        ? "列表"
        : "段落";
  return `${prefix}：${truncateAnchorForPosition(anchor.anchor, 28)}`;
}

export function formatInlineIllustrationPosition(
  anchor: Pick<MarkdownAnchor, "anchor">,
  placement: InlineIllustrationPlacement = "after"
): string {
  const normalizedAnchor = truncateAnchorForPosition(anchor.anchor);
  return `在“${normalizedAnchor}”${placement === "before" ? "之前" : "之后"}`;
}

export function buildInlineIllustrationPositionOptions(markdown: string): InlineIllustrationPositionOption[] {
  return extractMarkdownAnchors(markdown).map((anchor) => ({
    ...anchor,
    id: `${anchor.matchType}-${anchor.lineIndex}`,
    label: formatPositionOptionLabel(anchor),
    positionBefore: formatInlineIllustrationPosition(anchor, "before"),
    positionAfter: formatInlineIllustrationPosition(anchor, "after")
  }));
}

function inferPlacement(position: string): InlineIllustrationPlacement {
  return /之前|前/.test(position) ? "before" : "after";
}

function inferCandidateTypes(context: string): PositionCandidate["preferredMatchTypes"] {
  if (/段落|句子|列表|项目/.test(context)) {
    return ["paragraph", "list_item"];
  }
  if (/标题|小标题|章节|小节/.test(context)) {
    return ["heading"];
  }
  return ["heading", "paragraph", "list_item"];
}

function inferCandidatePriority(context: string): number {
  if (/段落|句子|列表|项目/.test(context)) {
    return 3;
  }
  if (/标题|小标题|章节|小节/.test(context)) {
    return 2;
  }
  return 1;
}

function uniqueCandidates(candidates: PositionCandidate[]): PositionCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.anchor}:${candidate.preferredMatchTypes.join(",")}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function extractPositionCandidates(position: string): PositionCandidate[] {
  const normalizedPosition = normalizeInlineIllustrationAnchor(position);
  const candidates: PositionCandidate[] = [];
  for (const match of normalizedPosition.matchAll(QUOTED_ANCHOR_PATTERN)) {
    const anchor = normalizeInlineIllustrationAnchor(match[1]);
    if (!anchor) {
      continue;
    }
    const context = normalizedPosition.slice(Math.max(0, match.index - 10), match.index);
    candidates.push({
      anchor,
      preferredMatchTypes: inferCandidateTypes(context),
      priority: inferCandidatePriority(context)
    });
  }

  if (candidates.length === 0 && normalizedPosition) {
    candidates.push({
      anchor: normalizedPosition,
      preferredMatchTypes: ["heading", "paragraph", "list_item"],
      priority: 1
    });
  }

  return uniqueCandidates(candidates);
}

function anchorMatches(candidate: PositionCandidate, anchor: MarkdownAnchor): boolean {
  if (!candidate.preferredMatchTypes.includes(anchor.matchType)) {
    return false;
  }
  if (anchor.anchor === candidate.anchor) {
    return true;
  }
  if (candidate.preferredMatchTypes.includes("paragraph") || candidate.preferredMatchTypes.includes("list_item")) {
    return anchor.anchor.includes(candidate.anchor);
  }
  return false;
}

function findCandidateMatch(candidates: PositionCandidate[], anchors: MarkdownAnchor[]): {
  candidate: PositionCandidate;
  anchor: MarkdownAnchor;
} | null {
  const ordered = [...candidates].sort((left, right) => right.priority - left.priority);
  for (const candidate of ordered) {
    const match = anchors.find((anchor) => anchorMatches(candidate, anchor));
    if (match) {
      return { candidate, anchor: match };
    }
  }
  return null;
}

function unmatchedResolution(position: string, placement: InlineIllustrationPlacement, warning?: string): InlineIllustrationPositionResolution {
  return {
    status: "unmatched",
    anchor: "",
    placement,
    matchedLine: null,
    lineIndex: null,
    matchType: "none",
    warning: warning || `未匹配插入位置：${position}`
  };
}

export function resolveInlineIllustrationPosition(
  markdown: string,
  position: string
): InlineIllustrationPositionResolution {
  const normalizedPosition = normalizeInlineIllustrationAnchor(position);
  const placement = inferPlacement(normalizedPosition);
  if (!normalizedPosition) {
    return unmatchedResolution(position, placement, "插入位置为空");
  }

  const anchors = extractMarkdownAnchors(markdown);
  if (anchors.length === 0) {
    return unmatchedResolution(position, placement);
  }

  const candidates = extractPositionCandidates(normalizedPosition);
  const matched = findCandidateMatch(candidates, anchors);
  if (!matched) {
    return unmatchedResolution(position, placement, `未匹配插入位置：${normalizedPosition}`);
  }

  const hasHigherPriorityMiss = candidates.some((candidate) => candidate.priority > matched.candidate.priority);
  const status: InlineIllustrationPositionStatus = hasHigherPriorityMiss ? "fallback" : "matched";
  const warning = hasHigherPriorityMiss
    ? `插入位置使用回退锚点：未找到更具体的段落或列表项，已匹配到「${matched.anchor.anchor}」。`
    : null;

  return {
    status,
    anchor: matched.candidate.anchor,
    placement,
    matchedLine: matched.anchor.line,
    lineIndex: matched.anchor.lineIndex,
    matchType: matched.anchor.matchType,
    warning
  };
}
