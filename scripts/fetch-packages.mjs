#!/usr/bin/env node
// Reads package.yml from a mydevmachine/packages checkout and writes a flat
// JSON list to src/data/packages.json. Output is gitignored: this repository
// never keeps its own copy of the packages repo's data.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { parse } from 'yaml'
import { widgetsOf } from './widget-areas.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const sourceDir = process.env.DEVMACHINE_PACKAGES
  ? resolvePath(process.env.DEVMACHINE_PACKAGES)
  : join(root, '..', 'packages')

function resolvePath(p) {
  return p.startsWith('/') ? p : join(process.cwd(), p)
}

const outDir = join(root, 'src', 'data')
const outPath = join(outDir, 'packages.json')
const packagesDir = join(sourceDir, 'packages')
const GITHUB_TREE = 'https://github.com/mydevmachine/packages/tree/main/packages'

if (!existsSync(packagesDir)) {
  console.error(`packages checkout not found at ${packagesDir}`)
  console.error('Set DEVMACHINE_PACKAGES to the path of a mydevmachine/packages checkout.')
  process.exit(1)
}

function collapseWhitespace(text) {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

function latestTag(dir) {
  try {
    return execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return null
  }
}

const release = latestTag(sourceDir)

const names = readdirSync(packagesDir)
  .filter((name) => statSync(join(packagesDir, name)).isDirectory())
  .sort()

const packages = []

for (const name of names) {
  const manifestPath = join(packagesDir, name, 'package.yml')
  if (!existsSync(manifestPath)) continue

  const doc = parse(readFileSync(manifestPath, 'utf8'))

  const variables = Object.entries(doc.variables ?? {}).map(([varName, def]) => ({
    name: varName,
    summary: collapseWhitespace(def?.summary),
    default: def?.default ?? null,
  }))

  const credentials = (doc.credentials ?? []).map((cred) => cred.name)

  packages.push({
    name: doc.name ?? name,
    scope: doc.scope ?? null,
    category: doc.category ?? 'Other',
    kind: doc.kind ?? null,
    summary: collapseWhitespace(doc.summary),
    variables,
    credentials,
    needs: doc.needs ?? [],
    widgets: widgetsOf(join(packagesDir, name), doc.widgets, doc.name ?? name),
    source: `${GITHUB_TREE}/${name}`,
  })
}

packages.sort((a, b) => a.name.localeCompare(b.name))

mkdirSync(outDir, { recursive: true })
writeFileSync(
  outPath,
  JSON.stringify({ release, packages }, null, 2),
)

const widgetCount = packages.reduce((n, p) => n + p.widgets.length, 0)
console.log(`fetch-packages: wrote ${packages.length} packages and ${widgetCount} widgets from ${sourceDir} to src/data/packages.json`)
