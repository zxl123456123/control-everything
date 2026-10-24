import { createHash, randomBytes, randomUUID } from 'node:crypto'

/**
 * `expo-crypto` for vitest, aliased in `vitest.config.ts`: the native module has no Node build, and
 * shared code reaches it through `randomV4Uuid`'s fallback. Node's secure source behind the same
 * names; a test file's own mock of `expo-crypto` still wins.
 */
export function getRandomBytes(byteCount: number): Uint8Array {
  return new Uint8Array(randomBytes(byteCount))
}

export { randomUUID }

export function getRandomValues<T extends Uint8Array>(array: T): T {
  array.set(randomBytes(array.byteLength))
  return array
}

export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' } as const
export const CryptoEncoding = { BASE64: 'base64', HEX: 'hex' } as const
export async function digestStringAsync(
  algorithm: string,
  value: string,
  options?: { encoding?: 'base64' | 'hex' }
): Promise<string> {
  return createHash(algorithm.replace('-', '').toLowerCase())
    .update(value)
    .digest(options?.encoding ?? 'hex')
}
