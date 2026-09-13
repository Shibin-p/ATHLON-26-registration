/**
 * Recursively removes keys with `undefined` values from an object or array.
 * Preserves Date objects, Firestore FieldValues / Timestamps, and null values.
 */
export function removeUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  // Preserve Date instances
  if (obj instanceof Date) {
    return obj;
  }

  // Preserve Firestore FieldValue / Timestamp sentinels (which typically have internal methods/symbols)
  if (
    typeof (obj as any).toMillis === 'function' ||
    typeof (obj as any).isEqual === 'function' ||
    (obj as any)._methodName
  ) {
    return obj;
  }

  // Handle Arrays
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => removeUndefined(item)) as unknown as T;
  }

  // Handle standard plain objects
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = removeUndefined(value);
    }
  }

  return result as T;
}
