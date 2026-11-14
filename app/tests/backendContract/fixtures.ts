import { createHash } from 'node:crypto'
import { expect } from 'vitest'

export const TEST_VOLUME_BYTES = Buffer.from(
  'synthetic contract-test volume bytes; not reconstruction output',
  'utf8',
)

export const IDENTITY_POSE = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

export const TRANSLATED_POSE = [
  1, 0, 0, 11,
  0, 1, 0, 12,
  0, 0, 1, 13,
  0, 0, 0, 1,
]

export const TEST_SPATIAL_META = {
  units: 'mm',
  space: 'left-posterior-superior',
  sizes: [2, 3, 4],
  spacings: [1, 2, 3],
  bboxMm: [2, 6, 12],
}

export function rawSha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function readJson<T>(response: Response): Promise<T> {
  expect(response.headers.get('content-type')).toContain('application/json')
  return response.json() as Promise<T>
}

export async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function expectJsonError(
  response: Response,
  status: number,
  message?: RegExp,
): Promise<string> {
  expect(response.status).toBe(status)
  const body = await readJson<{ error: string }>(response)
  expect(body).toEqual({ error: expect.any(String) })
  if (message) expect(body.error).toMatch(message)
  return body.error
}
