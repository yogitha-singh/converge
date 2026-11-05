/**
 * Comments are anchored to a text range. Offsets drift as the document is edited, so each
 * comment also stores the quoted text; we re-find that quote nearest to its original offset.
 */
export interface AnchorSource {
  range_start: number | null;
  range_end: number | null;
  quote: string | null;
}

export interface Range {
  start: number;
  end: number;
}

export function resolveAnchor(content: string, c: AnchorSource): Range | null {
  const { range_start: s, range_end: e, quote } = c;
  if (s == null || e == null) return null;
  if (!quote) return e <= content.length ? { start: s, end: e } : null;
  if (content.slice(s, e) === quote) return { start: s, end: e };

  let best = -1;
  let bestDistance = Infinity;
  let index = content.indexOf(quote);
  while (index !== -1) {
    const distance = Math.abs(index - s);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
    index = content.indexOf(quote, index + 1);
  }
  return best >= 0 ? { start: best, end: best + quote.length } : null;
}

export interface AnchoredRange extends Range {
  id: string;
  resolved: boolean;
}

export interface Segment {
  text: string;
  commentId?: string;
  resolved?: boolean;
}

/** Split `content` into plain / highlighted segments. Overlapping anchors: the earlier one wins. */
export function buildSegments(content: string, anchors: AnchoredRange[]): Segment[] {
  const sorted = [...anchors].sort((a, b) => a.start - b.start || a.end - b.end);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const anchor of sorted) {
    if (anchor.start < cursor || anchor.end <= anchor.start) continue;
    if (anchor.start > cursor) segments.push({ text: content.slice(cursor, anchor.start) });
    segments.push({ text: content.slice(anchor.start, anchor.end), commentId: anchor.id, resolved: anchor.resolved });
    cursor = anchor.end;
  }
  if (cursor < content.length) segments.push({ text: content.slice(cursor) });
  return segments;
}
