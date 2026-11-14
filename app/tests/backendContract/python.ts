import path from 'node:path'

/** Resolve a configured interpreter relative to the test caller, before child cwd changes. */
export function pythonExecutable(): string {
  const configured = process.env.SKULLFIX_PYTHON
  if (!configured) return 'python3'
  return configured.includes('/') || configured.includes('\\') ? path.resolve(configured) : configured
}
