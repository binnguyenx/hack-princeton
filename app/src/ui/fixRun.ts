import type { FixRunState } from '../api/client'

export type FixRun = FixRunState

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Poll a generate run until it succeeds or fails, reporting each server state in order. */
export async function watchRun(
  get: (runId: string) => Promise<FixRun>,
  runId: string,
  onUpdate: (run: FixRun) => void,
  sleep: (ms: number) => Promise<void> = wait,
  intervalMs = 2000,
): Promise<FixRun> {
  for (;;) {
    const run = await get(runId)
    onUpdate(run)
    if (run.status !== 'running') return run
    await sleep(intervalMs)
  }
}
