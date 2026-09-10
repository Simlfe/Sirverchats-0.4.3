export function getServerPassword(description?: string): string | null {
  if (!description) return null;
  const match = description.match(/\[password:([^\]]+)\]/);
  return match ? match[1] : null;
}

export function stripServerPassword(description?: string): string {
  if (!description) return '';
  return description.replace(/\s*\[password:[^\]]+\]\s*/g, '').trim();
}

export function setServerPassword(description: string, password?: string): string {
  const clean = stripServerPassword(description);
  if (!password) return clean;
  return `${clean}\n\n[password:${password}]`.trim();
}
