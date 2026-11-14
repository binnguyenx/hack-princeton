import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const srcRoot = path.join(repoRoot, 'data/samples')
const destRoot = path.join(here, '../public/samples')

mkdirSync(destRoot, { recursive: true })
const entries = readdirSync(srcRoot, { withFileTypes: true }).filter((d) => d.isDirectory())
const catalog = []

for (const d of entries) {
  const src = path.join(srcRoot, d.name)
  const dest = path.join(destRoot, d.name)
  mkdirSync(dest, { recursive: true })
  const metaPath = path.join(src, 'metadata.json')
  if (!existsSync(metaPath)) continue
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
  const primary = meta.primaryVolume || 'defective_skull.nrrd'
  cpSync(metaPath, path.join(dest, 'metadata.json'))
  cpSync(path.join(src, primary), path.join(dest, primary))
  catalog.push({
    id: meta.sampleId || d.name,
    label: d.name,
    primaryVolume: primary,
    baseUrl: `/samples/${d.name}`,
    license: meta.license ?? '',
  })
}

writeFileSync(
  path.join(destRoot, 'catalog.json'),
  JSON.stringify(catalog, null, 2) + '\n',
)
console.log(`Synced ${catalog.length} prepared samples → public/samples`)
