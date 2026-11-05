/**
 * Client-side three-way text rebase.
 *
 * The server is revision-authoritative and rejects stale writes. When a collaborator's edit
 * lands while we have unsent local typing, we must not drop either. Given
 *
 *   base   - the last server-confirmed text we hold
 *   local  - what is in the textarea now (base + our unsent edit)
 *   remote - the server's newer text (base + someone else's edit)
 *
 * each side is reduced to ONE contiguous replaced region relative to `base` (common prefix /
 * common suffix). If the two regions don't overlap, both edits are applied. If they do overlap,
 * the local edit wins (it is re-sent on top of the new revision) and `conflict` is reported so
 * the UI can tell the user. This is deliberately not OT/CRDT -- see docs/concurrency.md.
 */
export interface Region {
  start: number; // offset in base where the change begins
  baseEnd: number; // offset in base where the replaced text ends
  text: string; // replacement text
}

export function diffRegion(base: string, next: string): Region | null {
  if (base === next) return null;
  const max = Math.min(base.length, next.length);
  let start = 0;
  while (start < max && base[start] === next[start]) start++;
  let suffix = 0;
  while (
    suffix < max - start &&
    base[base.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++;
  }
  return { start, baseEnd: base.length - suffix, text: next.slice(start, next.length - suffix) };
}

export interface RebaseResult {
  text: string;
  conflict: boolean;
}

export function rebase(base: string, local: string, remote: string): RebaseResult {
  const l = diffRegion(base, local);
  const r = diffRegion(base, remote);
  if (!l) return { text: remote, conflict: false };
  if (!r) return { text: local, conflict: false };

  if (l.baseEnd <= r.start) {
    return {
      text: base.slice(0, l.start) + l.text + base.slice(l.baseEnd, r.start) + r.text + base.slice(r.baseEnd),
      conflict: false,
    };
  }
  if (r.baseEnd <= l.start) {
    return {
      text: base.slice(0, r.start) + r.text + base.slice(r.baseEnd, l.start) + l.text + base.slice(l.baseEnd),
      conflict: false,
    };
  }
  return { text: local, conflict: true };
}

/** Where should a caret at `pos` (in `local`) land after the remote edit is merged in? */
export function mapCaret(pos: number, base: string, local: string, remote: string): number {
  const l = diffRegion(base, local);
  const r = diffRegion(base, remote);
  if (!r) return pos;
  let remoteStartInLocal = r.start;
  if (l && l.baseEnd <= r.start) remoteStartInLocal += l.text.length - (l.baseEnd - l.start);
  const delta = r.text.length - (r.baseEnd - r.start);
  return pos >= remoteStartInLocal ? Math.max(0, pos + delta) : pos;
}
