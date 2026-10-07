// Which app areas a widget fits, and the widgets a package ships, for the
// packages page. The areas and the context each one gives are copied from the
// CLI's engine contract 1.3 (`devmachine widgets schema --json`), so a widget
// lands where `devmachine widgets list` says it fits.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { parse } from 'yaml'

const AREAS = [
  { label: 'Home', layout: 'canvas', gives: [] },
  { label: 'Sidebar', layout: 'stack', gives: ['selected'] },
  {
    label: 'Context sidebar',
    layout: 'stack',
    gives: ['machine', 'session', 'workspace', 'path', 'repo', 'branch', 'harness'],
  },
]

export function areasOf(widget) {
  const fits = widget.fits ?? []
  const required = Object.entries(widget.context ?? {})
    .filter(([, presence]) => presence === 'required')
    .map(([key]) => key)
  return AREAS.filter((area) => fits.includes(area.layout) && required.every((key) => area.gives.includes(key))).map(
    (area) => area.label,
  )
}

export function widgetsOf(packageDir, widgetsField, packageName) {
  if (!widgetsField) return []
  const root = resolve(packageDir, widgetsField)
  const inside = relative(resolve(packageDir), root)
  if (inside === '' || inside === '..' || inside.startsWith('..' + sep)) return []
  if (!existsSync(root) || !statSync(root).isDirectory()) return []

  const widgets = []
  for (const folder of readdirSync(root).sort()) {
    const file = join(root, folder, 'widget.yml')
    if (!existsSync(file)) continue
    let doc
    try {
      doc = parse(readFileSync(file, 'utf8'))
    } catch (error) {
      console.error(`fetch-packages: skipping ${file}: ${error.message}`)
      continue
    }
    widgets.push({
      name: `${packageName}/${folder}`,
      summary: (doc?.summary ?? '').replace(/\s+/g, ' ').trim(),
      areas: areasOf(doc ?? {}),
    })
  }
  return widgets
}
