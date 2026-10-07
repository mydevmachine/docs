# devmachine docs

The documentation site for the [devmachine CLI](https://github.com/mydevmachine/devmachine),
served from GitHub Pages at <https://mydevmachine.sh/>.

## What this is

An Astro + Tailwind CSS site with Pagefind search. It renders the CLI's
documentation; it never keeps its own copy. The source of truth for every doc
page stays in `mydevmachine/devmachine`'s `docs/` directory.

## How content is fetched

Two scripts pull content at build time, both from each source repository's
`main` branch. Their output is gitignored: this repository never keeps its
own copy of the CLI docs or the packages data.

### CLI docs

`scripts/fetch-docs.mjs` copies Markdown from a devmachine CLI checkout into
`src/content/docs/` (rebuilt on every `dev` or `build`). It:

- reads from `$DEVMACHINE_CLI_DOCS` (default `../devmachine-cli/docs`);
- rewrites relative `.md` links, anchors included, to site URLs at the site root;
- drops `development.md` and `releasing.md` (maintainer pages) and points a
  "Contributing" link at GitHub instead;
- reads each page's first `# Heading` as its title;
- derives sidebar order from `docs/index.md`'s link order, grouped into
  Getting started, Guides, Concepts, How it works, CLI Reference, and
  Troubleshooting (the mapping lives in `SECTION_BY_PREFIX` and `sectionFor()`
  in `scripts/fetch-docs.mjs` — see "Adding a new CLI doc page" below);
- reads the CLI checkout's latest git tag and the workspace default packages
  (parsed out of the CLI's own `internal/config/config.go`) and writes both
  to `src/data/cli.json`, so the packages page and the CLI version shown on
  the site can never disagree with the CLI's source.

A new page in the CLI's `docs/` shows up here without any change to this
repository.

### Guides

`docs/guides/` in the CLI is published at `/guides/`. Older CLI releases call
the folder `docs/examples/`; `fetch-docs.mjs` maps it to `/guides/` too, so
the site builds from either. Each guide's YAML frontmatter (`description`,
`category`, `minutes`, `level`, `needs`, `related`) feeds the cards on
`/guides/`, the chips under each guide's title and its "Next" list. A guide
without frontmatter still renders, with no chips.

The old `/examples/…` URLs are small redirect pages
(`src/pages/examples/`), and `/examples/<guide>.md` still serves the
Markdown, so links people saved keep working.

### Packages metadata

`scripts/fetch-packages.mjs` reads every `package.yml` from a
`mydevmachine/packages` checkout and writes a flat list to
`src/data/packages.json`. It:

- reads from `$DEVMACHINE_PACKAGES` (default `../packages`);
- reads the packages checkout's latest git tag as `release`, used for the
  site footer;
- for each package directory with a `package.yml`, records its name, scope,
  category, kind, summary, variables, credentials, and dependencies
  (`needs`), plus a link to its source on GitHub;
- reads each package's `widgets:` folder, when it has one, into `widgets`:
  each widget's full name, summary, and the app areas it fits (Home,
  Sidebar, Context sidebar), worked out in `scripts/widget-areas.mjs` the
  way the CLI does. `npm test` runs its tests.

## Run locally

Needs sibling checkouts of `mydevmachine/devmachine` and `mydevmachine/packages`
next to this repository:

```
../devmachine-cli   # or set DEVMACHINE_CLI_DOCS to its docs/ directory
../packages          # or set DEVMACHINE_PACKAGES to its checkout root
```

```
npm install
npm run dev
```

`npm run dev` runs `fetch-docs` and `fetch-packages`, then starts the Astro
dev server. Search does not work in dev — Pagefind only indexes a production
build.

## Build

```
npm run build
```

Runs `fetch-docs` and `fetch-packages`, builds the static site into `dist/`,
then indexes it with Pagefind (the `postbuild` script runs
`pagefind --site dist`). Check internal links with:

```
node scripts/check-links.mjs
```

## Deploy

`.github/workflows/deploy.yml` runs on push to `main`, on `workflow_dispatch`,
and every 6 hours (`cron: '0 */6 * * *'`). It checks out this repository,
`mydevmachine/devmachine`, and `mydevmachine/packages`, builds against their
live `main` branches, indexes with Pagefind, checks links, and deploys to
GitHub Pages. Because the schedule pulls fresh content on its own, a doc or
package change in either source repository reaches the site within six hours
without touching this one — or immediately, by running:

```
gh workflow run deploy.yml -R mydevmachine/docs
```

## Custom domain

The site is served from GitHub Pages at the custom domain in the `CNAME`
file, `mydevmachine.sh`, which sits behind Cloudflare. That proxying is a DNS
setting outside this repository — there is no Cloudflare or Wrangler config
here. GitHub still needs its own `cname` setting on the repository for Pages
to serve that domain. If that setting is ever lost (for example after a Pages
environment reset), restore it with:

```
gh api -X PUT repos/mydevmachine/docs/pages -f cname=mydevmachine.sh
```

## install.sh

`public/install.sh` is the one-line installer at
`https://mydevmachine.sh/install.sh` (`curl -fsSL https://mydevmachine.sh/install.sh | sh`).
It is a static file, copied as-is into the build like the rest of `public/`.
On macOS with Homebrew it installs through the tap; otherwise it downloads
the matching release archive from `mydevmachine/devmachine`, checks its
SHA-256 against the release's `checksums.txt`, and installs the binary to
`$DEVMACHINE_INSTALL_DIR` or `~/.local/bin`.

## llms.txt

`/llms.txt` and `/llms-full.txt` are generated at build time from the same
content collection: a link index with one-line summaries, and every page's
full Markdown concatenated in sidebar order. `llms.txt` links point at each
page's raw-Markdown URL (see below).

## Adding a new CLI doc page to a sidebar section

A page's sidebar section comes from its path in the CLI repo's `docs/`
directory, mapped in `scripts/fetch-docs.mjs`:

- `SECTION_BY_PREFIX` maps a path prefix to a section name: `guides/` to
  Guides, `concepts/` to Concepts, `how-it-works/` to How it works,
  `reference/` to CLI Reference.
- `sectionFor()` checks that list first, then a few top-level files
  (`getting-started.md`, `agent-setup.md`, `day-to-day.md`, `upgrade.md`) go
  to Getting started, and `troubleshooting.md` goes to Troubleshooting.

A new page under one of those prefixes picks up its section automatically. A
new top-level page needs a line added to `sectionFor()` in this repository,
or it is left out of the sidebar (`sectionFor()` returns `null`).

## Every page as Markdown

Each doc page is also served as raw Markdown at its URL plus `.md` (for
example `/getting-started.md`), generated at build time by
`src/pages/[...slug].md.ts` from the same content collection as the HTML
page. Its links are rewritten to absolute `https://mydevmachine.sh/...`
URLs, so a coding agent that fetches one page can follow links to the rest
without knowing the site's base path. Every HTML page links to its Markdown
twin with `<link rel="alternate" type="text/markdown">`, and
`scripts/check-links.mjs` verifies each one exists in the build.
