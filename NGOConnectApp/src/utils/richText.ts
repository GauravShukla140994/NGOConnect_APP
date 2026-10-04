/**
 * richText.ts — Utilities for rendering post content with clickable URLs.
 *
 * parseRichSegments(text) splits a string into alternating plain-text and URL
 * segments so callers can render each URL as a tappable <Text> component.
 *
 * No external dependencies — uses only built-in Linking from react-native.
 */

/** A single segment of rich text. */
export interface RichSegment {
  type:  'text' | 'url';
  value: string;
}

const URL_RE = /(https?:\/\/[^\s]+)/g;

/**
 * Splits `text` into plain-text and URL segments (in order).
 *
 * Example:
 *   "Check https://ripplehub.app for details"
 *   → [
 *       { type: 'text', value: 'Check ' },
 *       { type: 'url',  value: 'https://ripplehub.app' },
 *       { type: 'text', value: ' for details' },
 *     ]
 */
export function parseRichSegments(text: string): RichSegment[] {
  const segments: RichSegment[] = [];
  let last = 0;
  URL_RE.lastIndex = 0;               // reset /g flag before each run
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ type: 'text', value: text.slice(last, match.index) });
    }
    segments.push({ type: 'url', value: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ type: 'text', value: text.slice(last) });
  }
  return segments;
}

/** True when the text contains at least one URL. */
export function hasUrl(text: string): boolean {
  URL_RE.lastIndex = 0;
  return URL_RE.test(text);
}
