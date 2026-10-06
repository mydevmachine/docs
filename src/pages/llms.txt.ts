import type { APIRoute } from 'astro'
import { getSortedDocs, markdownUrlFor } from '../lib/nav'

export const prerender = true

export const GET: APIRoute = async () => {
  const docs = await getSortedDocs()
  const lines = [
    '# devmachine',
    '',
    '> devmachine turns a VPS into workspaces you develop in: one account per project, each with its own tools, logins and coding agent.',
    '',
    '## Docs',
    '',
    ...docs.map((entry) => `- [${entry.data.title}](https://mydevmachine.sh${markdownUrlFor(entry)}): ${entry.data.summary}`),
    '',
  ]
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
