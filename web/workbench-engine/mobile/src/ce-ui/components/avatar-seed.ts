// Deterministic avatar: initials and a hue from the display name / subject, so the same account
// always gets the same colour with no image to fetch.

export function avatarInitials(name: string | null | undefined): string {
  const text = (name ?? '').trim()
  if (!text) return '?'
  const words = text.split(/\s+/).filter(Boolean)
  const chars = Array.from(text)
  const asciiWords = words.every((word) => /^[\x21-\x7e]/.test(word))
  if (asciiWords && words.length >= 2) {
    return (Array.from(words[0]!)[0]! + Array.from(words[words.length - 1]!)[0]!).toUpperCase()
  }
  return (chars[0] ?? '?').toUpperCase()
}

/** 0-359, stable across runs (FNV-1a over UTF-16 code units). */
export function avatarHue(seed: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash % 360
}
