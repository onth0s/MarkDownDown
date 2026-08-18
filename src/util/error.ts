/**
 * Safe error message extraction.
 * Handles Error instances, strings, and unknown thrown values.
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}

/**
 * Safely get a value from a Map, throwing a clear error if missing.
 */
export function getOrThrow<K, V>(map: Map<K, V>, key: K, context: string): V {
  const val = map.get(key);
  if (val === undefined) throw new Error(`${context}: missing key ${String(key)}`);
  return val;
}
