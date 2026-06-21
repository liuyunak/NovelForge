/**
 * Jaccard similarity between two strings.
 * Splits by whitespace (word-level), suitable for general text comparison.
 *
 * @returns A value between 0 (no overlap) and 1 (identical).
 */
export function jaccardSimilarity(a: string, b: string): number {
  const aWords = new Set(a.split(/\s+/))
  const bWords = new Set(b.split(/\s+/))
  const intersection = new Set([...aWords].filter(x => bWords.has(x)))
  const union = new Set([...aWords, ...bWords])
  return union.size === 0 ? 0 : intersection.size / union.size
}

/**
 * Character-level Jaccard similarity for Chinese text.
 * Splits by individual characters (ignoring whitespace), suitable for
 * detecting near-duplicate Chinese sentences or paragraphs.
 *
 * @returns A value between 0 (no overlap) and 1 (identical).
 */
export function jaccardCharSimilarity(a: string, b: string): number {
  const aChars = new Set(a.replace(/\s/g, '').split(''))
  const bChars = new Set(b.replace(/\s/g, '').split(''))
  const intersection = new Set([...aChars].filter(x => bChars.has(x)))
  const union = new Set([...aChars, ...bChars])
  return union.size === 0 ? 0 : intersection.size / union.size
}
