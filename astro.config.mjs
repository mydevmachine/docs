import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import rehypeDocTabs from './src/lib/rehype-doc-tabs.mjs'

// github-dark's comment grey (#6A737D) is 3:1 on its own background; WCAG AA needs 4.5:1.
const readableComments = {
  name: 'readable-comments',
  span(node) {
    const style = node.properties?.style
    if (typeof style === 'string' && /#6A737D/i.test(style)) {
      node.properties.style = style.replace(/#6A737D/gi, '#959DA5')
    }
  },
}

const isElement = (node, tag) => node?.type === 'element' && node.tagName === tag
const textOf = (node) =>
  node.type === 'text' ? node.value : (node.children ?? []).map(textOf).join('')

// A Markdown table whose top-left header cell is empty is a grid with row labels:
// an empty <th> has no name for screen readers, and the first cell of each row is its header.
function rehypeTableHeaders() {
  const walk = (node) => {
    if (isElement(node, 'table')) fixTable(node)
    for (const child of node.children ?? []) walk(child)
  }
  const fixTable = (table) => {
    const thead = table.children.find((c) => isElement(c, 'thead'))
    const tbody = table.children.find((c) => isElement(c, 'tbody'))
    const headRow = thead?.children.find((c) => isElement(c, 'tr'))
    const corner = headRow?.children.find((c) => isElement(c, 'th'))
    if (!corner || textOf(corner).trim() !== '') return
    corner.tagName = 'td'
    for (const th of headRow.children.filter((c) => isElement(c, 'th'))) th.properties = { ...th.properties, scope: 'col' }
    for (const row of tbody?.children.filter((c) => isElement(c, 'tr')) ?? []) {
      const first = row.children.find((c) => isElement(c, 'td'))
      if (first) {
        first.tagName = 'th'
        first.properties = { ...first.properties, scope: 'row' }
      }
    }
  }
  return walk
}

export default defineConfig({
  site: 'https://mydevmachine.sh',
  trailingSlash: 'always',
  markdown: {
    shikiConfig: { theme: 'github-dark', transformers: [readableComments] },
    rehypePlugins: [rehypeTableHeaders, rehypeDocTabs],
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
