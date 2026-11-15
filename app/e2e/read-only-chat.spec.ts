import { test, expect } from '@playwright/test'

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
  expect(await (await request.get(`/api/projects/${projectId}`)).json()).toEqual(before)
  const offline = await request.get('/api/ai/chat')
  expect(offline.status()).toBe(404)
  expect(await offline.json()).toEqual({error:'API route not found'})
})
