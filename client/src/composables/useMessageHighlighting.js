import { Bold, Italic, Underline } from "@lucide/vue";

export const HIGHLIGHT_STYLE_OPTIONS = Object.freeze([
  { label: "Bold", value: "bold", icon: Bold },
  { label: "Italic", value: "italic", icon: Italic },
  { label: "Underline", value: "underline", icon: Underline },
]);

const HIGHLIGHT_STYLE_ORDER = HIGHLIGHT_STYLE_OPTIONS.map((option) => option.value);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeHighlightWords(words) {
  const result = [];
  for (const word of Array.isArray(words) ? words : []) {
    const trimmed = String(word || "").trim();
    if (!trimmed) continue;
    if (result.some((item) => item.toLowerCase() === trimmed.toLowerCase())) continue;
    result.push(trimmed);
  }
  return result;
}

export function normalizeHighlightStyles(styles) {
  const selected = new Set(Array.isArray(styles) ? styles : []);
  return HIGHLIGHT_STYLE_ORDER.filter((style) => selected.has(style));
}

export function highlightTextStyle(styles, color) {
  const normalized = normalizeHighlightStyles(styles);
  const style = {};

  if (color) {
    style.color = color;
  }

  if (normalized.includes("bold")) {
    style.fontWeight = 800;
  }
  if (normalized.includes("italic")) {
    style.fontStyle = "italic";
  }
  if (normalized.includes("underline")) {
    style.textDecoration = "underline";
    style.textUnderlineOffset = "0.14em";
    style.textDecorationThickness = "0.12em";
  }

  return style;
}

export function messageHasHighlight(text, words) {
  const normalizedWords = normalizeHighlightWords(words);
  if (!normalizedWords.length) return false;

  const pattern = normalizedWords
    .map((word) => escapeRegExp(word))
    .sort((left, right) => right.length - left.length)
    .join("|");

  return new RegExp(`(?:^|\\W)(?:${pattern})(?=\\W|$)`, "i").test(String(text || ""));
}
