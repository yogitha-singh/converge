/**
 * Pixel coordinates of a character offset inside a <textarea>, so remote cursors and the
 * floating "Comment" button can be positioned. Technique: render the text up to the offset
 * in an invisible mirror element with identical typography and read a marker span's position.
 */
const MIRROR_PROPS = [
  "boxSizing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
  "textTransform", "wordSpacing", "tabSize", "overflowWrap", "wordBreak",
] as const;

let cachedMirror: HTMLDivElement | null = null;

function getMirror(): HTMLDivElement {
  if (cachedMirror && document.body.contains(cachedMirror)) return cachedMirror;
  const div = document.createElement("div");
  div.setAttribute("aria-hidden", "true");
  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.whiteSpace = "pre-wrap";
  div.style.top = "0";
  div.style.left = "-9999px";
  document.body.appendChild(div);
  cachedMirror = div;
  return div;
}

export interface CaretCoordinates {
  top: number;
  left: number;
  height: number;
}

export function getCaretCoordinates(textarea: HTMLTextAreaElement, offset: number): CaretCoordinates {
  const mirror = getMirror();
  const computed = window.getComputedStyle(textarea);
  const style = mirror.style as unknown as Record<string, string>;
  for (const prop of MIRROR_PROPS) style[prop] = computed[prop] as string;
  mirror.style.width = `${textarea.clientWidth + parseFloat(computed.borderLeftWidth || "0") + parseFloat(computed.borderRightWidth || "0")}px`;

  const clamped = Math.max(0, Math.min(offset, textarea.value.length));
  mirror.textContent = "";
  mirror.appendChild(document.createTextNode(textarea.value.substring(0, clamped)));
  const marker = document.createElement("span");
  marker.textContent = textarea.value.charAt(clamped) || ".";
  mirror.appendChild(marker);

  const lineHeight = parseFloat(computed.lineHeight);
  return {
    top: marker.offsetTop - textarea.scrollTop,
    left: marker.offsetLeft - textarea.scrollLeft,
    height: Number.isNaN(lineHeight) ? 20 : lineHeight,
  };
}
