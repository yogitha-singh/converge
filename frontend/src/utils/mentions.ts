/** `@handle` helpers. Must stay in sync with backend/app/services/comment_service.py (user_handles). */
export const MENTION_RE = /@([\w.\-]+)/g;

export interface Mentionable {
  name: string;
  email: string;
}

export function handleFor(name: string): string {
  return name.replace(/\s+/g, "");
}

export function handlesOf(person: Mentionable): string[] {
  return [handleFor(person.name).toLowerCase(), person.email.split("@")[0].toLowerCase()];
}

export interface TextPart {
  text: string;
  mention: boolean;
}

/** Split text so that @handles belonging to real members can be styled. */
export function splitMentions(text: string, validHandles: Set<string>): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION_RE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index), mention: false });
    parts.push({ text: match[0], mention: validHandles.has(match[1].toLowerCase()) });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), mention: false });
  return parts;
}

/** If the caret is inside an unfinished `@query`, return where it starts and the query. */
export function activeMentionQuery(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const match = /(?:^|\s)@([\w.\-]*)$/.exec(before);
  if (!match) return null;
  return { start: before.length - match[1].length - 1, query: match[1] };
}
