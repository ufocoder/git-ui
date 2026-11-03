export function splitCommitMessage(message: string): { subject: string; body: string } {
  const normalized = message.replace(/\r\n/g, "\n");
  const end = normalized.indexOf("\n");
  if (end === -1) return { subject: normalized, body: "" };
  const rest = normalized.slice(end + 1);
  return { subject: normalized.slice(0, end), body: rest.startsWith("\n") ? rest.slice(1) : rest };
}

export function composeCommitMessage(subject: string, body: string): string {
  // Keep drafts intact while typing. Whitespace is trimmed only on submission.
  return body.length ? `${subject}\n\n${body}` : subject;
}
