#!/usr/bin/env node
// Copies Markdown docs from a devmachine CLI checkout into src/content/docs/,
// rewriting relative .md links to site URLs and adding frontmatter (title,
// section, order) derived from docs/index.md. Output is gitignored: this
// repository never keeps its own copy of the CLI's documentation.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync, copyFileSync } from 'node:fs'
import { join, dirname, relative, resolve, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { parse as parseYaml } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const sourceDir = process.env.DEVMACHINE_CLI_DOCS
  ? resolve(process.cwd(), process.env.DEVMACHINE_CLI_DOCS)
  : join(root, '..', 'devmachine-cli', 'docs')

const outDir = join(root, 'src', 'content', 'docs')

const DROPPED = new Set(['development.md', 'releasing.md'])
const BASE = ''
const GITHUB_BLOB = 'https://github.com/mydevmachine/devmachine/blob/main/docs'

// The CLI renamed docs/examples/ to docs/guides/. Both are published under
// /guides/, so the site builds from a CLI release on either side of the rename.
const LEGACY_GUIDES_PREFIX = 'examples/'
const GUIDES_PREFIX = 'guides/'

function publicPath(relPath) {
  return relPath.startsWith(LEGACY_GUIDES_PREFIX) ? GUIDES_PREFIX + relPath.slice(LEGACY_GUIDES_PREFIX.length) : relPath
}

const SECTION_BY_PREFIX = [
  ['guides/', 'Guides'],
  ['concepts/', 'Concepts'],
  ['how-it-works/', 'How it works'],
  ['reference/', 'CLI Reference'],
]

function sectionFor(relPath) {
  for (const [prefix, name] of SECTION_BY_PREFIX) {
    if (publicPath(relPath).startsWith(prefix)) return name
  }
  if (relPath === 'getting-started.md') return 'Getting started'
  if (relPath === 'agent-setup.md') return 'Getting started'
  if (relPath === 'day-to-day.md') return 'Getting started'
  if (relPath === 'upgrade.md') return 'Getting started'
  if (relPath === 'supported-systems.md') return 'Getting started'
  if (relPath === 'changelog.md') return 'Getting started'
  if (relPath === 'troubleshooting.md') return 'Troubleshooting'
  return null
}

function slugFor(relPath) {
  const noExt = publicPath(relPath).replace(/\.md$/, '').replace(/(^|\/)index$/, '')
  if (noExt === '') return `${BASE}/`
  return `${BASE}/${noExt}/`
}

function walk(dir, base = '') {
  const entries = []
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    const rel = base ? `${base}/${name}` : name
    if (statSync(full).isDirectory()) {
      entries.push(...walk(full, rel))
    } else if (name.endsWith('.md')) {
      entries.push(rel)
    }
  }
  return entries
}

if (!existsSync(sourceDir)) {
  console.error(`devmachine CLI docs not found at ${sourceDir}`)
  console.error('Set DEVMACHINE_CLI_DOCS to the path of a devmachine-cli checkout docs/ directory.')
  process.exit(1)
}

const allFiles = walk(sourceDir).map((p) => p.split('\\').join('/'))
const keptFiles = allFiles.filter((f) => f !== 'index.md' && !DROPPED.has(f))

const indexRaw = existsSync(join(sourceDir, 'index.md')) ? readFileSync(join(sourceDir, 'index.md'), 'utf8') : ''

function parseIndexOrder(markdown) {
  const order = new Map()
  let position = 0
  const linkRe = /\]\(([a-zA-Z0-9_./-]+\.md)(#[^)]*)?\)/g
  let match
  while ((match = linkRe.exec(markdown))) {
    const target = publicPath(match[1])
    if (!order.has(target)) order.set(target, position++)
  }
  return order
}

const indexOrder = parseIndexOrder(indexRaw)

function orderFor(relPath) {
  const path = publicPath(relPath)
  if (indexOrder.has(path)) return indexOrder.get(path)
  return 10000
}

function splitFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) return { meta: {}, content: markdown }
  return { meta: parseYaml(match[1]) ?? {}, content: markdown.slice(match[0].length) }
}

function guideMeta(meta, relPath) {
  if (!publicPath(relPath).startsWith(GUIDES_PREFIX)) return {}
  const dir = dirname(relPath)
  return {
    description: meta.description ?? null,
    category: meta.category ?? null,
    minutes: typeof meta.minutes === 'number' ? meta.minutes : null,
    level: meta.level ?? null,
    needs: Array.isArray(meta.needs) ? meta.needs.map(String) : [],
    related: Array.isArray(meta.related)
      ? meta.related.map((target) => slugFor(posix.normalize(posix.join(dir, String(target)))))
      : [],
  }
}

function firstHeading(markdown, fallback) {
  const match = markdown.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : fallback
}

function resolveLinkTarget(currentRelPath, linkTarget) {
  const currentDir = dirname(currentRelPath)
  const [pathPart, anchor] = splitAnchor(linkTarget)
  const resolved = posix.normalize(posix.join(currentDir === '.' ? '' : currentDir, pathPart))
  return { resolved, anchor }
}

function splitAnchor(target) {
  const idx = target.indexOf('#')
  if (idx === -1) return [target, '']
  return [target.slice(0, idx), target.slice(idx)]
}

function rewriteLinks(markdown, currentRelPath) {
  return markdown.replace(/\]\(([a-zA-Z0-9_./-]+\.md)(#[^)]*)?\)/g, (full, linkPath, anchor) => {
    const { resolved } = resolveLinkTarget(currentRelPath, linkPath + (anchor ?? ''))
    if (DROPPED.has(resolved)) {
      return `](${GITHUB_BLOB}/${resolved}${anchor ?? ''})`
    }
    const url = slugFor(resolved)
    return `](${url}${anchor ?? ''})`
  })
}

const ASSET_EXTENSIONS = /\.(svg|png|jpe?g|gif|webp)$/i
const assetsDir = join(root, 'public', 'docs-assets')
const ASSETS_URL = `${BASE}/docs-assets`

function rewriteAssets(markdown, currentRelPath) {
  return markdown.replace(/\]\(([a-zA-Z0-9_./-]+\.(?:svg|png|jpe?g|gif|webp))\)/gi, (full, assetPath) => {
    const { resolved } = resolveLinkTarget(currentRelPath, assetPath)
    return `](${ASSETS_URL}/${publicPath(resolved)})`
  })
}

function walkAssets(dir, base = '') {
  const entries = []
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    const rel = base ? `${base}/${name}` : name
    if (statSync(full).isDirectory()) entries.push(...walkAssets(full, rel))
    else if (ASSET_EXTENSIONS.test(name)) entries.push(rel)
  }
  return entries
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
rmSync(assetsDir, { recursive: true, force: true })

for (const relPath of walkAssets(sourceDir)) {
  const target = join(assetsDir, publicPath(relPath))
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(join(sourceDir, relPath), target)
}

const pages = []

for (const relPath of keptFiles) {
  const { meta, content: raw } = splitFrontmatter(readFileSync(join(sourceDir, relPath), 'utf8'))
  const title = publicPath(relPath) === 'guides/index.md' ? 'All guides' : firstHeading(raw, relPath)
  const section = sectionFor(relPath)
  const body = rewriteAssets(rewriteLinks(raw.replace(/^#\s+.+\n/, ''), relPath), relPath)
  const firstParagraph = (body.match(/^(?!#|```|\s*$)(.+(?:\n(?!\s*$|#|```|[-*] ).+)*)/m) || [, ''])[1]
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const guide = guideMeta(meta, relPath)
  const summary = guide.description ?? firstParagraph

  const outRel = publicPath(relPath)
  const outPath = join(outDir, outRel)
  mkdirSync(dirname(outPath), { recursive: true })

  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `section: ${JSON.stringify(section)}`,
    `order: ${orderFor(relPath)}`,
    `sourcePath: ${JSON.stringify(`docs/${relPath}`)}`,
    `summary: ${JSON.stringify(summary)}`,
    ...Object.entries(guide).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    '---',
    '',
  ].join('\n')

  writeFileSync(outPath, frontmatter + body)

  pages.push({
    relPath,
    slug: slugFor(relPath).replace(/^\/docs\//, '').replace(/\/$/, '') || 'index',
    title,
    section,
    order: orderFor(relPath),
    url: slugFor(relPath),
    summary,
  })
}

writeFileSync(join(outDir, '_manifest.json'), JSON.stringify(pages, null, 2))

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

const dataDir = join(root, 'src', 'data')
mkdirSync(dataDir, { recursive: true })
const cliVersion = latestTag(sourceDir)

// What `setup` seeds every new workspace with, read from the CLI's own source so
// the packages page can never disagree with it.
function workspaceDefaults(cliRoot) {
  try {
    const source = readFileSync(join(cliRoot, 'internal', 'config', 'config.go'), 'utf8')
    const match = source.match(/DefaultWorkspacePackages = \[\]string\{([^}]*)\}/)
    return match ? [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : []
  } catch {
    return []
  }
}

writeFileSync(
  join(dataDir, 'cli.json'),
  JSON.stringify({ version: cliVersion, workspaceDefaults: workspaceDefaults(dirname(sourceDir)) }, null, 2),
)
console.log(`fetch-docs: CLI version ${cliVersion ?? 'unknown'}`)

console.log(`fetch-docs: wrote ${pages.length} pages from ${sourceDir} to ${relative(root, outDir)}`)
