import { execFileSync, execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { promisify } from 'node:util'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, symlinkSync, linkSync, writeFileSync, unlinkSync } from 'node:fs'
import { disposableChatRoot, assertDisposableChatProfile } from '../e2e/disposable-chat'

it('default browser discovery excludes mutating chat specs without needing a storage override', () => {
  const env = {...process.env}
  delete env.HACK_CHAT_TEST_ROOT
  const output = execFileSync(path.resolve('node_modules/.bin/playwright'),
    ['test','--list','--config','playwright.config.ts'], {env, encoding:'utf8',timeout:15000})
  expect(output).toContain('canvas-workflow.spec.ts')
  expect(output).not.toContain('read-only-chat.spec.ts')
})


const owned: string[] = []
function fresh() { const root = mkdtempSync('/private/tmp/hp-chat-e2e-'); owned.push(root); return root }
afterEach(() => { for (const root of owned.splice(0)) rmSync(root,{recursive:true,force:true}) })

it('requires the dedicated profile and its exclusive URL even when a temporary root is present', () => {
  const root = fresh()
  const profile = {disposableChatProfile:1,chatRoot:root,chatBuilt:false}
  expect(() => assertDisposableChatProfile(profile,'http://127.0.0.1:18573')).not.toThrow()
  expect(() => assertDisposableChatProfile({...profile,chatBuilt:true},'http://127.0.0.1:18583')).not.toThrow()
  expect(() => assertDisposableChatProfile({},'http://127.0.0.1:5173')).toThrow('dedicated disposable profile')
  expect(() => assertDisposableChatProfile(profile,'http://127.0.0.1:5173')).toThrow('non-profile server URL')
  expect(() => assertDisposableChatProfile(profile,'http://127.0.0.1:8000')).toThrow('non-profile server URL')
})
it('rejects noncanonical roots and a symlink root without touching its target', () => {
  const root = fresh()
  expect(disposableChatRoot(root)).toBe(root)
  for (const invalid of [undefined,'/Users/example/project/data/storage',`${root}/../${path.basename(root)}`]) {
    expect(() => disposableChatRoot(invalid)).toThrow()
  }
  const alias = `${root}-alias`; owned.push(alias)
  symlinkSync(root,alias)
  expect(() => disposableChatRoot(alias)).toThrow('real temporary directory')
})
it('rejects storage-directory and database-file links into other roots', () => {
  const root = fresh(), other = fresh()
  const storage = path.join(root,'storage')
  symlinkSync(other,storage)
  expect(() => disposableChatRoot(root)).toThrow('inside its temporary root')
  unlinkSync(storage); mkdirSync(storage)
  const external = path.join(other,'external.sqlite'); writeFileSync(external,'temporary sentinel')
  const database = path.join(storage,'app-model.sqlite')
  symlinkSync(external,database)
  expect(() => disposableChatRoot(root)).toThrow('linked or external files')
  unlinkSync(database); linkSync(external,database)
  expect(() => disposableChatRoot(root)).toThrow('linked or external files')
})

it('an alternate runner without the disposable profile fails before any HTTP request', async () => {
  const root = fresh(), calls: string[] = []
  const trap = createServer((request,response) => {
    calls.push(`${request.method} ${request.url}`)
    response.writeHead(500,{'content-type':'application/json'}).end('{"error":"test trap"}')
  })
  await new Promise<void>(resolve => trap.listen(0,'127.0.0.1',resolve))
  try {
    const address = trap.address()
    if (!address || typeof address === 'string') throw new Error('Trap server failed to start')
    writeFileSync(path.join(root,'package.json'),'{"type":"module"}')
    const config = path.join(root,'unsafe-runner.config.ts')
    writeFileSync(config, `import base from ${JSON.stringify(path.resolve('e2e/read-only-chat.config.ts'))};
export default {...base, metadata:{}, webServer:[], testDir:${JSON.stringify(path.resolve('e2e'))},
outputDir:${JSON.stringify(path.join(root,'unsafe-results'))},
use:{...base.use, channel:undefined, launchOptions:{executablePath:${JSON.stringify(path.join(root,'browser-must-not-launch'))}}, baseURL:${JSON.stringify(`http://127.0.0.1:${address.port}`)}}};`)
    const error = await promisify(execFile)(path.resolve('node_modules/.bin/playwright'),['test','--config',config],
      {env:{...process.env,HACK_CHAT_TEST_ROOT:root},timeout:25000})
      .then(() => null, reason => reason as {code?:unknown;stdout?:string;stderr?:string})
    expect(error?.code).toBe(1)
    expect((error?.stdout ?? '') + (error?.stderr ?? '')).toContain('Chat tests require the dedicated disposable profile')
    expect(calls).toEqual([])
  } finally {
    trap.closeAllConnections()
    await new Promise<void>((resolve,reject) => trap.close(error => error ? reject(error) : resolve()))
  }
},30000)
