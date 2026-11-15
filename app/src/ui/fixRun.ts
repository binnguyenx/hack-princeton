import { ApiCodeError, type FixRunState } from '../api/client'

export type FixRun = FixRunState

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export type WatchOptions = {
  sleep?: (ms: number) => Promise<void>
  intervalMs?: number
  /** Consecutive failed polls tolerated before giving up (a single blip must not end tracking). */
  maxConsecutiveErrors?: number
  /** Client-side ceiling; the backend gives up after 15 minutes, so this only catches a stuck server. */
  timeoutMs?: number
  now?: () => number
}

/** Thrown when the client stops tracking a run whose outcome on the server is unknown. */
export class FixRunLostError extends Error {
  readonly runId: string
  constructor(runId: string, message: string) {
    super(message)
    this.runId = runId
  }
}

/** Poll a generate run until it succeeds or fails, reporting each server state in order. */
export async function watchRun(
  get: (runId: string) => Promise<FixRun>,
  runId: string,
  onUpdate: (run: FixRun) => void,
  {
    sleep = wait,
    intervalMs = 2000,
    maxConsecutiveErrors = 5,
    timeoutMs = 20 * 60 * 1000,
    now = Date.now,
  }: WatchOptions = {},
): Promise<FixRun> {
  const started = now()
  let errors = 0
  for (;;) {
    let run: FixRun
    try {
      run = await get(runId)
      errors = 0
    } catch (error) {
      // The run is gone (e.g. the backend restarted): retrying cannot help.
      if (error instanceof ApiCodeError && error.code === 'run-not-found') throw error
      errors += 1
      if (errors > maxConsecutiveErrors) {
        throw new FixRunLostError(runId, 'Lost contact with the fix run. It may still finish; reload the project to check.')
      }
      await sleep(intervalMs * Math.min(2 ** errors, 8))
      continue
    }
    onUpdate(run)
    if (run.status !== 'running') return run
    if (now() - started > timeoutMs) {
      throw new FixRunLostError(runId, 'The fix run is taking longer than expected. Reload the project to check for the result.')
    }
    await sleep(intervalMs)
  }
}
