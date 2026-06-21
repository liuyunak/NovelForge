/**
 * Text utility functions for the NovelForge Studio.
 */

/** CJK Unified Ideographs ranges (loose match for common cases) */
function isCJKChar(cp: number): boolean {
  return (cp >= 0x4E00 && cp <= 0x9FFF)  // CJK Unified
    || (cp >= 0x3400 && cp <= 0x4DBF)     // CJK Unified Extension A
    || (cp >= 0x20000 && cp <= 0x2A6DF)   // CJK Unified Extension B
    || (cp >= 0xF900 && cp <= 0xFAFF)     // CJK Compatibility
    || (cp >= 0x2F800 && cp <= 0x2FA1F)   // CJK Compatibility Supplement
}

/** Whitespace code points */
function isWhitespace(cp: number): boolean {
  return cp === 0x20 || cp === 0x09 || cp === 0x0A || cp === 0x0D || cp === 0x3000
}

/**
 * Strip common Markdown formatting characters for more accurate word counting.
 * Removes: headings (#), bold/italic (*, _), code fences, blockquotes,
 * links (keeps link text), images, and horizontal rules.
 */
function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')        // ATX headings
    .replace(/^>\s?/gm, '')              // Blockquotes
    .replace(/^[*\-+]\s+/gm, '')         // Unordered lists
    .replace(/^\d+\.\s+/gm, '')          // Ordered lists
    .replace(/^```[\s\S]*?```/gm, '')    // Code fences
    .replace(/`{1,3}[^`]*`{1,3}/g, '')  // Inline code
    .replace(/!\[.*?\]\(.*?\)/g, '')     // Images
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1') // Links (keep text)
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2') // Bold/italic
    .replace(/~~(.*?)~~/g, '$1')         // Strikethrough
    .replace(/^---+$/gm, '')             // Horizontal rules
    .replace(/\{\{.*?\}\}/g, '')         // Wikilinks / templates
}

/**
 * Count "words" in mixed Chinese/English text.
 *
 * For CJK characters: each character = 1 word (Chinese convention).
 * For non-CJK runs (English, numbers): each whitespace-separated token = 1 word.
 * Punctuation and whitespace are excluded.
 *
 * Uses Intl.Segmenter when available (Chrome 87+, Node 16+),
 * with a regex fallback for older environments.
 */
export function countWords(text: string | null | undefined, stripMd = false): number {
  if (!text) return 0

  const source = stripMd ? stripMarkdown(text) : text

  // Preferred: Intl.Segmenter with "word" granularity
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })
      let count = 0
      for (const seg of segmenter.segment(source)) {
        if (seg.isWordLike) count++
      }
      return count
    } catch {
      // Fall through to regex fallback
    }
  }

  // Fallback: manual CJK + word-boundary counting
  let count = 0
  const len = source.length
  let i = 0

  while (i < len) {
    const cp = text.codePointAt(i)!
    const step = cp > 0xFFFF ? 2 : 1

    if (isCJKChar(cp)) {
      count++
      i += step
    } else if (!isWhitespace(cp)) {
      // Non-CJK token: count the whole run as 1 word
      count++
      while (i < len) {
        const nc = text.codePointAt(i)!
        if (isCJKChar(nc) || isWhitespace(nc)) break
        i += nc > 0xFFFF ? 2 : 1
      }
    } else {
      i += step
    }
  }

  return count
}
