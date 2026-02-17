const REFERENCE_PATTERN = /^(?:[1-3]\s)?[A-Za-z]+(?:\s+[A-Za-z]+)*\s+\d+(?:(?::\d+)?\s*[-\u2013]\s*\d+|:\d+)?$/;

export function normalizeReference(reference: string): string {
  return reference.replace(/\s+/g, " ").replace(/\u2013/g, "-").trim();
}

export function isValidReference(reference: string): boolean {
  return REFERENCE_PATTERN.test(normalizeReference(reference));
}
