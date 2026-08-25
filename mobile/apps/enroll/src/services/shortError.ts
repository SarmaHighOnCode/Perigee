/**
 * Native bridges (Nitro, ONNX Runtime) reject with errors whose `message`
 * embeds full JS/native stack traces. The UI should only ever show the first
 * line; the complete error goes to the console for diagnosis.
 */
export function shortError(error: unknown, maxLength = 240): string {
  const raw = error instanceof Error ? error.message : String(error);
  const firstLine = (raw.split('\n', 1)[0] ?? raw).trim();
  if (firstLine.length <= maxLength) return firstLine;
  return `${firstLine.slice(0, maxLength)}…`;
}
