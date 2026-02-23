/**
 * @typedef {{ id: string; entityType: string; entityId: string; terms: string[]; displayText?: string; priority?: number; source?: string; color?: string }} HighlightEntity
 * @typedef {{ id: string; entityType: string; entityId: string; start: number; end: number; displayText: string; source: string; color?: string }} HighlightDecoration
 * @typedef {{ type: "text"; text: string; start: number; end: number } | { type: "highlight"; text: string; start: number; end: number; decoration: HighlightDecoration }} TextSegment
 */

const DEFAULT_PARSE_DELAY_MS = 140;
export const TAG_MARKER = "\u2063";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeTerms = (terms) =>
  Array.from(
    new Set(
      (terms || [])
        .map((term) => String(term || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => b.length - a.length);

const compareCandidates = (a, b) => {
  if (a.start !== b.start) return a.start - b.start;
  if (a.end !== b.end) return b.end - a.end; // start asc, end desc
  if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
  return a.id.localeCompare(b.id);
};

const pickBestInCluster = (cluster, cursor) => {
  const available = cluster.filter((candidate) => candidate.start >= cursor);
  if (available.length === 0) return null;
  return available.sort((a, b) => {
    if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
    const aLen = a.end - a.start;
    const bLen = b.end - b.start;
    if (bLen !== aLen) return bLen - aLen;
    if (a.start !== b.start) return a.start - b.start;
    return a.id.localeCompare(b.id);
  })[0];
};

/**
 * Deterministic overlap resolution.
 * Rule: higher priority wins, then longest match, then earliest start.
 * Output is non-overlapping and sorted by start asc.
 * @param {HighlightDecoration[]} candidates
 * @returns {HighlightDecoration[]}
 */
export function resolveOverlappingHighlights(candidates) {
  const sorted = [...(candidates || [])].sort(compareCandidates);
  const resolved = [];
  let i = 0;
  let cursor = 0;

  while (i < sorted.length) {
    const seed = sorted[i];
    let clusterEnd = seed.end;
    const cluster = [seed];
    let j = i + 1;
    while (j < sorted.length && sorted[j].start < clusterEnd) {
      cluster.push(sorted[j]);
      clusterEnd = Math.max(clusterEnd, sorted[j].end);
      j += 1;
    }

    const chosen = pickBestInCluster(cluster, cursor);
    if (chosen && chosen.end > cursor) {
      resolved.push(chosen);
      cursor = chosen.end;
    }
    i = j;
  }

  return resolved.sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * Parse entities against a raw text into deterministic range decorations.
 * @param {string} text
 * @param {HighlightEntity[]} entities
 * @returns {HighlightDecoration[]}
 */
export function parseHighlights(text, entities) {
  if (!text) return [];
  /** @type {HighlightDecoration[]} */
  const candidates = [];

  (entities || []).forEach((entity) => {
    const terms = normalizeTerms(entity.terms || []);
    terms.forEach((term) => {
      // Only explicitly tagged occurrences should highlight.
      // Tagging inserts an invisible marker right before the intended phrase.
      const regex = new RegExp(`${escapeRegex(TAG_MARKER)}${escapeRegex(term)}`, "gi");
      let match;
      while ((match = regex.exec(text))) {
        const markerLength = TAG_MARKER.length;
        const start = match.index + markerLength;
        const end = start + (match[0].length - markerLength);
        candidates.push({
          id: `${entity.id}:${start}:${end}:${term.toLowerCase()}`,
          entityType: entity.entityType,
          entityId: entity.entityId,
          start,
          end,
          displayText: match[0].slice(markerLength),
          source: entity.source || "parser",
          color: entity.color,
          priority: entity.priority || 0,
        });
      }
    });
  });

  return resolveOverlappingHighlights(candidates).map((decoration) => {
    const next = { ...decoration };
    delete next.priority;
    return next;
  });
}

/**
 * Build render segments from raw text + decorations.
 * @param {string} text
 * @param {HighlightDecoration[]} decorations
 * @returns {TextSegment[]}
 */
export function segmentText(text, decorations) {
  if (!text) return [];
  const valid = [...(decorations || [])]
    .filter((decoration) => decoration.start >= 0 && decoration.end > decoration.start && decoration.end <= text.length)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  /** @type {TextSegment[]} */
  const segments = [];
  let cursor = 0;

  valid.forEach((decoration) => {
    if (decoration.start < cursor) return;
    if (decoration.start > cursor) {
      segments.push({ type: "text", text: text.slice(cursor, decoration.start), start: cursor, end: decoration.start });
    }
    segments.push({
      type: "highlight",
      text: text.slice(decoration.start, decoration.end),
      start: decoration.start,
      end: decoration.end,
      decoration,
    });
    cursor = decoration.end;
  });

  if (cursor < text.length) {
    segments.push({ type: "text", text: text.slice(cursor), start: cursor, end: text.length });
  }

  return segments;
}

/**
 * @param {HighlightDecoration[]} a
 * @param {HighlightDecoration[]} b
 * @returns {boolean}
 */
export function decorationsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id ||
      left.entityType !== right.entityType ||
      left.entityId !== right.entityId ||
      left.start !== right.start ||
      left.end !== right.end ||
      left.displayText !== right.displayText ||
      left.source !== right.source ||
      left.color !== right.color
    ) {
      return false;
    }
  }
  return true;
}

/**
 * @param {number} [delayMs]
 */
export function getHighlightParseDelay(delayMs) {
  return typeof delayMs === "number" && delayMs > 0 ? delayMs : DEFAULT_PARSE_DELAY_MS;
}
