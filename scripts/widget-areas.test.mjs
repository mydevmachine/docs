import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { areasOf, widgetsOf } from './widget-areas.mjs'

test('a canvas widget goes on Home only', () => {
  assert.deepEqual(areasOf({ fits: ['canvas'] }), ['Home'])
})

test('a stack widget with no required context fits both sidebars', () => {
  assert.deepEqual(areasOf({ fits: ['canvas', 'stack'], context: {} }), ['Home', 'Sidebar', 'Context sidebar'])
})

test('a widget that requires the session fits only the context sidebar', () => {
  assert.deepEqual(areasOf({ fits: ['stack'], context: { session: 'required' } }), ['Context sidebar'])
})

test('an optional context key does not narrow the areas', () => {
  assert.deepEqual(areasOf({ fits: ['stack'], context: { workspace: 'optional' } }), ['Sidebar', 'Context sidebar'])
})

test('a slot-only widget fits no area yet', () => {
  assert.deepEqual(areasOf({ fits: ['slot'] }), [])
})

function packageWith(files) {
  const dir = mkdtempSync(join(tmpdir(), 'pkg-'))
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), body)
  }
  return dir
}

test('widgetsOf reads each widget folder, sorted, and skips what is not a widget', () => {
  const dir = packageWith({
    'widgets/clock/widget.yml': 'name: clock\nsummary: The time.\nfits: [canvas]\n',
    'widgets/todo/widget.yml': 'name: todo\nsummary: The `plan`.\nfits: [stack]\ncontext: {session: required}\n',
    'widgets/notes.txt': 'not a widget',
    'widgets/empty/README.md': 'no widget.yml',
    'widgets/broken/widget.yml': 'name: [\n',
  })
  assert.deepEqual(widgetsOf(dir, 'widgets', 'mine'), [
    { name: 'mine/clock', summary: 'The time.', areas: ['Home'] },
    { name: 'mine/todo', summary: 'The `plan`.', areas: ['Context sidebar'] },
  ])
})

test('widgetsOf is empty without a widgets folder, or with one outside the package', () => {
  const dir = packageWith({ 'tasks/main.yml': '[]\n' })
  assert.deepEqual(widgetsOf(dir, undefined, 'mine'), [])
  assert.deepEqual(widgetsOf(dir, 'widgets', 'mine'), [])
  assert.deepEqual(widgetsOf(dir, '../elsewhere', 'mine'), [])
})
