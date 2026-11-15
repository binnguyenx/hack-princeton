import { test, expect } from '@playwright/test'
import { assertDisposableChatProfile } from './disposable-chat'

// This guard also protects alternate runners that explicitly include this spec.
test.beforeEach(({baseURL}, info) => assertDisposableChatProfile(info.config.metadata, baseURL))

const spatial = { units:'mm', sizes:[2,3,4], spacings:[1,1,1], bboxMm:[2,3,4] }
test('restored UI chats with FastAPI and never writes from chat', async ({page,request}) => {
  const created = await request.post('/api/projects', {data:{name:'Read-only browser proof'}})
  expect(created.status()).toBe(201)
  const projectId = (await created.json()).projectId
  const caseId = (await (await request.post(`/api/projects/${projectId}/cases`, {data:{name:'Case'}})).json()).caseId
  const uploaded = await request.post(`/api/projects/${projectId}/cases/${caseId}/samples`, {multipart:{
    file:{name:'skull.nrrd',mimeType:'application/octet-stream',buffer:Buffer.concat([Buffer.from('NRRD0005\ntype: unsigned char\ndimension: 3\nsizes: 2 3 4\nencoding: raw\n\n'),Buffer.alloc(24,1)])},
    displayName:'Browser skull',spatiallyVerified:'true',meta:JSON.stringify(spatial)}})
  expect(uploaded.status()).toBe(201)
  const before = await (await request.get(`/api/projects/${projectId}`)).json()
  const chatRequests: unknown[] = []
  page.on('request', req => {if(req.url().endsWith('/api/ai/chat')) chatRequests.push(req.postDataJSON())})
  await page.goto('/')
  await page.getByRole('region', {name:'Projects home'}).getByRole('button',{name:'Read-only browser proof',exact:true}).click()
  await expect(page.getByText('Browser skull', {exact:true}).first()).toBeVisible()
  await page.getByRole('button',{name:'Open 3D',exact:true}).first().click()
  const panel = page.getByRole('region',{name:'AI Workspace Assistant'})
  await expect(panel).toBeVisible()
  await expect(panel.getByLabel('Message for AI assistant')).toBeEnabled()
  await panel.getByRole('button',{name:'Draft reconstruction brief',exact:true}).click()
  await expect(panel.getByText(/Read-only reconstruction brief\./)).toBeVisible()
  await panel.getByLabel('Message for AI assistant').fill('I want to work on the skull')
  await panel.getByLabel('Send message to AI assistant').click()
  await expect(panel.getByText(/We can inspect the selected skull source metadata/)).toBeVisible()
  expect(chatRequests).toHaveLength(2)
  expect(chatRequests[0]).toMatchObject({project_id:projectId,case_id:caseId,object_id:before.samples[0].sourceAnatomy.objectId,expected_revision_id:null,history:[]})
  expect(chatRequests[1]).toMatchObject({history:[{role:'human',content:'Draft reconstruction brief'},{role:'assistant',content:expect.stringContaining('Read-only reconstruction brief')}]})
  await expect(panel.getByText('What would you like to work on?')).toHaveCount(0)
  // Repeated follow-ups must resolve past earlier follow-up tokens.
  for (const message of ['Draft reconstruction brief','continue','continue']) {
    await expect(panel.getByLabel('Message for AI assistant')).toBeEnabled()
    const reply = page.waitForResponse(response => response.url().endsWith('/api/ai/chat'))
    await panel.getByLabel('Message for AI assistant').fill(message)
    await panel.getByLabel('Send message to AI assistant').click()
    expect((await (await reply).json()).outcome.explanation).toContain('Read-only reconstruction brief.')
  }
  expect(await (await request.get(`/api/projects/${projectId}`)).json()).toEqual(before)
  const offline = await request.get('/api/ai/chat')
  expect(offline.status()).toBe(404)
  expect(await offline.json()).toEqual({error:'API route not found'})
})

test('fake tool reads a restored candidate pointer, refuses mutation prompts and reports stale context', async ({page,request}) => {
  const projectId = (await (await request.post('/api/projects',{data:{name:'Restored fake-tool audit'}})).json()).projectId
  const caseId = (await (await request.post(`/api/projects/${projectId}/cases`,{data:{name:'Case'}})).json()).caseId
  const sampleId = (await (await request.post(`/api/projects/${projectId}/cases/${caseId}/samples`,{multipart:{
    file:{name:'source.nrrd',mimeType:'application/octet-stream',buffer:Buffer.concat([Buffer.from('NRRD0005\ntype: unsigned char\ndimension: 3\nsizes: 2 3 4\nencoding: raw\n\n'),Buffer.alloc(24,1)])},
    displayName:'Protected source',spatiallyVerified:'true',meta:JSON.stringify(spatial)}})).json()).sampleId
  const candidate = await (await request.post(`/api/samples/${sampleId}/candidates`)).json()
  const pose = [1,0,0,5,0,1,0,0,0,0,1,0,0,0,0,1]
  const transformed = await request.post(`/api/candidates/${candidate.candidateId}/transform`,{data:{pose}})
  expect(transformed.status()).toBe(201)
  const newer = await transformed.json()
  expect(newer.revisionId).toEqual(expect.any(String))
  expect(newer.revisionId).not.toBe(candidate.revisionId)
  expect((await request.post(`/api/candidates/${candidate.candidateId}/restore`,{data:{revisionId:candidate.revisionId}})).status()).toBe(200)
  const before = await (await request.get(`/api/projects/${projectId}`)).json()
  expect(before.revisions).toHaveLength(2)
  expect(before.revisions).toEqual(expect.arrayContaining([
    expect.objectContaining({id:candidate.revisionId,order:0}),
    expect.objectContaining({id:newer.revisionId,order:1}),
  ]))
  expect(before.candidates[0].currentRevisionId).toBe(candidate.revisionId)
  await page.goto('/')
  await page.getByRole('region',{name:'Projects home'}).getByRole('button',{name:'Restored fake-tool audit',exact:true}).click()
  await page.getByRole('row').filter({hasText:candidate.candidateId}).getByRole('button',{name:'Edit 3D',exact:true}).click()
  const panel = page.getByRole('region',{name:'AI Workspace Assistant'})
  await expect(panel.getByLabel('Message for AI assistant')).toBeEnabled()
  const reply = page.waitForResponse(response => response.url().endsWith('/api/ai/chat'))
  await panel.getByLabel('Message for AI assistant').fill('Apply placement, restore, then generate a candidate')
  await panel.getByLabel('Send message to AI assistant').click()
  const result = await (await reply).json()
  expect(result.outcome.steps).toEqual(['load_context','propose','validate','execute','explain'])
  expect(result.outcome.observation.scope).toBe('application-read')
  expect(result.outcome.observation.metadata.revision_id).toBe(candidate.revisionId)
  expect(result.outcome.context.revision_id).toBe(candidate.revisionId)
  expect(result.outcome.context.revision_id).not.toBe(newer.revisionId)
  await expect(panel.getByText(/It cannot recommend clinical implant parameters/)).toBeVisible()
  await expect(panel.getByText(new RegExp(`Current candidate revision: ${candidate.revisionId}`))).toBeVisible()
  expect(await (await request.get(`/api/projects/${projectId}`)).json()).toEqual(before)
  // A manual change after the UI loaded must not silently retarget the next AI read.
  const changed = await request.post(`/api/candidates/${candidate.candidateId}/transform`,{data:{pose}})
  expect(changed.status()).toBe(201)
  const afterManual = await (await request.get(`/api/projects/${projectId}`)).json()
  await panel.getByLabel('Message for AI assistant').fill('Describe selection')
  await panel.getByLabel('Send message to AI assistant').click()
  await expect(panel.getByRole('alert')).toContainText('stale-revision')
  expect(await (await request.get(`/api/projects/${projectId}`)).json()).toEqual(afterManual)
})

test('switching documents ignores retained viewport selection and starts fresh chat history', async ({page,request}) => {
  const projectId = (await (await request.post('/api/projects',{data:{name:'Document chat scope'}})).json()).projectId
  const caseId = (await (await request.post(`/api/projects/${projectId}/cases`,{data:{name:'Case'}})).json()).caseId
  for (const displayName of ['Doc A','Doc B']) {
    const response = await request.post(`/api/projects/${projectId}/cases/${caseId}/samples`,{multipart:{
      file:{name:'source.nrrd',mimeType:'application/octet-stream',buffer:Buffer.concat([Buffer.from('NRRD0005\ntype: unsigned char\ndimension: 3\nsizes: 2 3 4\nencoding: raw\n\n'),Buffer.alloc(24,1)])},
      displayName,spatiallyVerified:'true',meta:JSON.stringify(spatial)}})
    expect(response.status()).toBe(201)
  }
  const before = await (await request.get(`/api/projects/${projectId}`)).json()
  const sourceA = before.samples.find((sample: {displayName:string}) => sample.displayName === 'Doc A').sourceAnatomy.objectId
  const sourceB = before.samples.find((sample: {displayName:string}) => sample.displayName === 'Doc B').sourceAnatomy.objectId
  await page.goto('/')
  await page.getByRole('region',{name:'Projects home'}).getByRole('button',{name:'Document chat scope',exact:true}).click()
  await page.getByRole('row').filter({hasText:'Doc A'}).getByRole('button',{name:'Open 3D',exact:true}).click()
  await page.getByRole('button',{name:'Cases & Anatomy',exact:true}).click()
  await page.getByRole('row').filter({hasText:'Doc B'}).getByRole('button',{name:'Open 3D',exact:true}).click()
  // Exercise the public view-only operation; this does not touch the application DB.
  const selected = await page.evaluate(id => {
    const debug = window.__hackPrincetonDebug
    return debug?.ops.selectObject(debug.ctx,id)
  },sourceA)
  expect(selected?.ok).toBe(true)
  await page.getByRole('tab',{name:/Doc A/}).click()
  const panel = page.getByRole('region',{name:'AI Workspace Assistant'})
  await expect(panel.getByLabel('Message for AI assistant')).toBeEnabled()
  const first = page.waitForResponse(response => response.url().endsWith('/api/ai/chat'))
  await panel.getByLabel('Message for AI assistant').fill('Describe skull A')
  await panel.getByLabel('Send message to AI assistant').click()
  const firstBody = await (await first).json()
  expect(firstBody.outcome.context.selected_object_id).toBe(sourceA)
  await page.getByRole('tab',{name:/Doc B/}).click()
  await expect(panel.locator('.ai-chat-context')).toContainText('Doc B')
  await expect(panel.getByText('Describe skull A',{exact:true})).toHaveCount(0,{timeout:3000})
  const second = page.waitForResponse(response => response.url().endsWith('/api/ai/chat'))
  await panel.getByLabel('Message for AI assistant').fill('Describe skull B')
  await panel.getByLabel('Send message to AI assistant').click()
  const secondResponse = await second
  const sent = secondResponse.request().postDataJSON()
  expect(sent.object_id).toBe(sourceB)
  expect(sent.history).toEqual([])
  expect(sent.conversation_id).not.toBe(firstBody.conversation_id)
  expect((await secondResponse.json()).outcome.context.selected_object_id).toBe(sourceB)
  const selection = await page.evaluate(() => window.__hackPrincetonDebug?.ctx.store.getState()?.view.selectionObjectId)
  expect(selection).toBe(sourceA)
  expect(await (await request.get(`/api/projects/${projectId}`)).json()).toEqual(before)
})
