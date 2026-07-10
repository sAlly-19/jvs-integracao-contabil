import type { LayoutIdentificationCandidate, LayoutIdentificationResult, StatementLayout, StatementLayoutSource } from "../types";
import { getEnabledStatementLayouts } from "./statement-layout-store";

export function identifyStatementLayout(source: StatementLayoutSource, content: string): LayoutIdentificationResult {
  const layouts = getEnabledStatementLayouts(source);

  if (source === "ofx") {
    const ofxLayout = layouts.find((layout) => layout.parser === "ofx-universal") ?? null;
    return {
      layout: ofxLayout,
      confidence: ofxLayout ? 1 : 0,
      candidates: ofxLayout ? [scoreLayout(ofxLayout, content)] : [],
      strategy: "universal"
    };
  }

  const candidates = layouts
    .filter((layout) => layout.matchers.length > 0)
    .map((layout) => scoreLayout(layout, content))
    .filter((candidate) => candidate.matchedRequired && candidate.score > 0 && candidate.score >= candidate.layout.minimumScore)
    .sort((a, b) => b.confidence - a.confidence || b.score - a.score || b.layout.priority - a.layout.priority);

  const bestCandidate = candidates[0];

  if (!bestCandidate) {
    const fallbackLayout = layouts.find((layout) => layout.parser === "pdf-bruteforce" || layout.id === "outros-csv-bruteforce") ?? null;

    return {
      layout: fallbackLayout,
      confidence: 0,
      candidates,
      strategy: "bruteforce"
    };
  }

  return {
    layout: bestCandidate.layout,
    confidence: bestCandidate.confidence,
    candidates,
    strategy: "layout"
  };
}

function scoreLayout(layout: StatementLayout, content: string): LayoutIdentificationCandidate {
  const normalizedContent = normalizeSearchText(content);
  const totalWeight = layout.matchers.reduce((total, matcher) => total + matcher.weight, 0);
  const matchedMatchers: string[] = [];
  let score = 0;
  let matchedRequired = true;

  for (const matcher of layout.matchers) {
    const matched = matcher.type === "regex" ? matchRegex(matcher.value, content) : normalizedContent.includes(normalizeSearchText(matcher.value));

    if (matched) {
      score += matcher.weight;
      matchedMatchers.push(matcher.id);
    } else if (matcher.required) {
      matchedRequired = false;
    }
  }

  const confidence = totalWeight > 0 ? score / totalWeight : 0;

  return {
    layout,
    matchedRequired,
    score,
    totalWeight,
    confidence,
    matchedMatchers
  };
}

function matchRegex(pattern: string, content: string) {
  try {
    return new RegExp(pattern, "i").test(content);
  } catch {
    return false;
  }
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
