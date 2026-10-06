// Turns a block of the CLI's Markdown written as
//
//   <!-- tabs -->
//   #### Tailscale
//   ...
//   #### Headscale
//   ...
//   <!-- /tabs -->
//
// into tabs. The markers are comments so the same file reads as plain
// subheadings on GitHub and in the packages' skill references.

const OPEN = /^\s*tabs\s*$/
const CLOSE = /^\s*\/tabs\s*$/

function markerText(node) {
  if (node.type === 'comment') return node.value
  if (node.type === 'raw') {
    const match = node.value.trim().match(/^<!--([\s\S]*)-->$/)
    return match ? match[1] : null
  }
  return null
}

const isMarker = (node, re) => {
  const text = markerText(node)
  return text !== null && re.test(text)
}

const isTabHeading = (node) => node.type === 'element' && node.tagName === 'h4'

const textOf = (node) =>
  node.type === 'text' ? node.value : (node.children ?? []).map(textOf).join('')

function buildTabs(nodes, groupId) {
  const tabs = []
  for (const node of nodes) {
    if (isTabHeading(node)) tabs.push({ label: textOf(node).trim(), body: [] })
    else if (tabs.length) tabs.at(-1).body.push(node)
  }
  if (tabs.length < 2) return null

  const buttons = tabs.map((tab, i) => ({
    type: 'element',
    tagName: 'button',
    properties: {
      type: 'button',
      role: 'tab',
      id: `${groupId}-tab-${i}`,
      ariaControls: `${groupId}-panel-${i}`,
      ariaSelected: String(i === 0),
      tabIndex: i === 0 ? 0 : -1,
      className: ['tab-btn'],
    },
    children: [{ type: 'text', value: tab.label }],
  }))

  const panels = tabs.map((tab, i) => ({
    type: 'element',
    tagName: 'div',
    properties: {
      role: 'tabpanel',
      id: `${groupId}-panel-${i}`,
      ariaLabelledBy: `${groupId}-tab-${i}`,
      tabIndex: i === 0 ? 0 : -1,
      ...(i === 0 ? {} : { dataInactive: '' }),
    },
    children: tab.body,
  }))

  return {
    type: 'element',
    tagName: 'div',
    properties: { className: ['doc-tabs'] },
    children: [
      { type: 'element', tagName: 'div', properties: { role: 'tablist' }, children: buttons },
      { type: 'element', tagName: 'div', properties: { className: ['tab-panels'] }, children: panels },
    ],
  }
}

export default function rehypeDocTabs() {
  return (tree) => {
    let groups = 0
    const walk = (parent) => {
      const children = parent.children ?? []
      for (let i = 0; i < children.length; i++) {
        if (!isMarker(children[i], OPEN)) {
          walk(children[i])
          continue
        }
        const end = children.findIndex((node, j) => j > i && isMarker(node, CLOSE))
        if (end === -1) continue
        const tabs = buildTabs(children.slice(i + 1, end), `doc-tabs-${groups++}`)
        if (tabs) children.splice(i, end - i + 1, tabs)
      }
    }
    walk(tree)
  }
}
