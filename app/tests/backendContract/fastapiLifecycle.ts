import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RunningContractBackend } from './types'
import { pythonExecutable } from './python'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

export interface FastApiTestOptions {
  storageRoot?: string
  frontendDir?: string
}

export async function createFastApiContractBackend(
  options: FastApiTestOptions = {},
): Promise<RunningContractBackend> {
  const owned = !options.storageRoot
  const storageRoot = options.storageRoot ?? await mkdtemp(path.join(os.tmpdir(), 'hp-fastapi-contract-'))
  let child: ChildProcess | undefined
  let currentUrl = ''
  let errors = ''

  async function stop(): Promise<void> {
    const process = child
    child = undefined
    if (!process || process.exitCode !== null) return
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { process.kill('SIGKILL'); reject(new Error('FastAPI shutdown timed out')) }, 5000)
      process.once('exit', () => { clearTimeout(timeout); resolve() })
      process.kill('SIGTERM')
    })
  }

  async function start(): Promise<void> {
    errors = ''
    const script = `
import json, socket, sys
from pathlib import Path
import uvicorn
from skullfix_ai.api.app import create_app
sock = socket.socket()
sock.bind(('127.0.0.1', 0))
sock.listen(128)
app = create_app(Path(sys.argv[1]), frontend_dir=Path(sys.argv[2]) if sys.argv[2] else None)
print(json.dumps({'port': sock.getsockname()[1]}), flush=True)
uvicorn.Server(uvicorn.Config(app, log_level='warning', lifespan='on')).run(sockets=[sock])
`
    child = spawn(pythonExecutable(), ['-B', '-c', script, storageRoot, options.frontendDir ?? ''], {
      cwd: repoRoot,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONPATH: path.join(repoRoot, 'backend/ai/src') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stderr!.on('data', (chunk) => { errors = (errors + String(chunk)).slice(-12000) })
    const port = await new Promise<number>((resolve, reject) => {
      let output = ''
      const timeout = setTimeout(() => reject(new Error(`FastAPI startup timed out: ${errors}`)), 10000)
      child!.once('error', (error) => { clearTimeout(timeout); reject(error) })
      child!.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`FastAPI exited ${code}: ${errors}`)) })
      child!.stdout!.on('data', (chunk) => {
        output += String(chunk)
        const line = output.split('\n')[0]
        if (!output.includes('\n')) return
        try { const parsed = JSON.parse(line); clearTimeout(timeout); resolve(parsed.port) }
        catch (error) { clearTimeout(timeout); reject(error) }
      })
    })
    currentUrl = `http://127.0.0.1:${port}`
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`FastAPI stopped: ${errors}`)
      try {
        const response = await fetch(`${currentUrl}/api/projects`, { signal: AbortSignal.timeout(1000) })
        if (response.ok) return
        throw new Error(`FastAPI readiness status ${response.status}: ${await response.text()}`)
      } catch (error) {
        if (Date.now() + 30 >= deadline) throw error
        await new Promise((resolve) => setTimeout(resolve, 30))
      }
    }
    throw new Error(`FastAPI not ready: ${errors}`)
  }

  try { await start() }
  catch (error) { await stop(); if (owned) await rm(storageRoot, { recursive: true, force: true }); throw error }
  return {
    get baseUrl() { return currentUrl },
    storageRoot,
    async restart() { await stop(); await start() },
    async close() { try { await stop() } finally { if (owned) await rm(storageRoot, { recursive: true, force: true }) } },
  }
}
