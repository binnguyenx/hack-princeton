export function newId(prefix: string): string {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `x${Math.random().toString(16).slice(2)}`
  return `${prefix}-${id.slice(0, 8)}`
}
