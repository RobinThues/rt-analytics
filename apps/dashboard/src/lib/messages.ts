/**
 * Message for an error code from the URL. Codes are hand-editable, so only own keys count:
 * "__proto__" or "constructor" must not reach Object.prototype.
 */
export function pickMessage(
  messages: Readonly<Record<string, string>>,
  code: string | string[] | undefined,
): string | null {
  if (typeof code !== "string") return null;
  return Object.hasOwn(messages, code) ? (messages[code] ?? null) : "Something went wrong.";
}
