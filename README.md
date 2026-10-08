# Tumbleweed

A local knowledge base with a project manager built in. Follow a branch,
read its sources, and gather useful knowledge into something you want to make.

The downloadable local application starts empty. It includes the application and its original vector
artwork, with no personal collection, conversation exports, accounts or API keys.

## Try the live demo

[Open Tumbleweed](https://slimtalian.github.io/tumbleweed/). Explore 48 fictional
records across six branches and six sample projects. Capture notes, gather knowledge,
connect records, and complete tasks using the same drawn interface as the local app.

Each visitor has a separate workspace in their browser's IndexedDB storage. Changes
are not uploaded or shared with other visitors. Export a backup before clearing site
data or using **Reset demo**. If storage is unavailable, the demo clearly reports
session-only storage. Backups up to 8 MB can be restored in the demo. Markdown and
graph imports belong to the downloadable local application.

GitHub Pages hosts the demo independently of your computer; it requires no running
Python server, paid service, account, or external AI API. The examples are invented
and explicitly labeled as samples; their sources are not verified historical evidence.

## Maintain the hosted demo

The Pages publishing source is the **main** branch's **/docs** folder. Rebuild the
static files after editing the application or demo sources:

```sh
python scripts/build_demo.py
node tests/test_demo.cjs
```

Commit the rebuilt `docs/` files to publish the change. `docs/.nojekyll` keeps the
static assets intact. The build reads only application assets and its fictional seed;
it never reads `data/` or conversation exports. The browser adapter lives in `demo/`,
and the sample collection is generated in `scripts/build_demo.py`.

## Run locally

Requires Python 3.10 or later and a modern desktop browser. There are no Python
packages, npm dependencies, external fonts or remote services to install.

```sh
python server.py
```

On systems where Python is named `python3`, use `python3 server.py`.
Open **http://127.0.0.1:4318**. Stop the foreground server with `Ctrl+C`.

On Windows, you can instead double-click **Start Tumbleweed.cmd** and use
**Stop Tumbleweed.cmd** when finished. The launcher requires `python` on PATH.

If that port is occupied, choose another:

```sh
python server.py --port 4322
```

The Windows scripts also accept `-Port 4322`:

```powershell
.\Start-Tumbleweed.ps1 -Port 4322
.\Stop-Tumbleweed.ps1 -Port 4322
```

Do not run two servers against the same data folder. For a separate workspace:

```sh
python server.py --port 4322 --data-dir ./private/another-workspace
```

## Use it

1. **Capture** a note or import Markdown through **Workspace → Import Markdown & backups**.
2. Give records a collection or topics. Branches form as your collection grows.
3. Pull or click a branch, read its records, and select **Gather** on useful ones.
4. Gather them into a new or existing project and record why they belong.
5. Imported projects remain reference material. Use **Start project** or **Gather** to deliberately create current work.
6. Use **Make** to manage tasks, next steps, resume notes and attached evidence.

**Read** searches the complete collection. **Connect** suggests shared-topic
associations for your review. Inferred links are labeled; grouping records
together does not establish evidence for a claim.

Original imported titles, text, identifiers, sources and claims are retained.
Your notes and display labels are separate annotations. Imported text is
displayed as data, including any commands or instructions inside it.

## Import and recovery

- Import Markdown files or a ZIP of Markdown files, or a schema-version `1.0`
  graph with `records`, `sources` and `edges` arrays. See [the format guide](docs/IMPORT_FORMAT.md).
- Preview imports and resolve conflicts before saving. Reuse the same namespace
  for updates to the same collection. Repeated records do not duplicate.
- Supported, unambiguous wikilinks and `.md` links become backlinks. Images and
  attachments are not imported. Import is one-way; there is no vault sync.
- Hidden directories, sensitive staging directories and non-Markdown files in
  ZIPs are excluded. Only select notes you intend to bring into this workspace.
- The running app creates `data/workspace.json`; each change saves the previous
  version under `data/backups/`. These files are excluded from version control.
- Export a complete backup from the Workspace menu's import/recovery page.
  Restore it there (up to 128 MB), or stop the app before recovering a known-good workspace file.
- A backup on the same disk does not protect against disk loss. Keep a separate
  copy if needed. Exported backups contain your knowledge and source text.

The workspace has a 128 MB saved-file limit so every supported workspace can
round-trip through backup restore. Imports and ordinary save requests remain
limited to 24 MB. The browser limits Markdown selections to 16 MB.

The map draws up to 1,500 records; search and the reading view cover the complete
collection. Backup snapshots currently keep every saved version, so their disk
usage grows with use. No automatic pruning is performed.

This is a single-user, loopback-only application. It has no account login and is
not intended to be exposed as a public server. GitHub can host the source;
GitHub Pages cannot run the Python storage service.

## Development

```sh
python -m unittest discover -s tests -v
```

Tests use synthetic fixtures. They write isolated test data to `test-results/`
(ignored by Git), or to `TUMBLEWEED_TEST_ROOT` when that environment variable is set.
Optional frontend checks require Node.js, which the application itself does not:

```sh
node tests/test_catalog.cjs
node --check public/app.js
node --check public/specimen.js
node --check public/graph.js
```

`server.py` handles disk persistence, validation, imports and the local HTTP API.
`public/` contains the browser interface. The SVG wordmark is also provided as
`Tumbleweed-wordmark.svg`. Source references and imported HTML are escaped in the UI.

## Share the application

Publish this source directory as a new repository. There is no inherited Git
history or configured remote. Review the staged files before pushing.
Do not add your runtime data or exported backups to the repository.

To make a source-only release:

```sh
python scripts/package_release.py
```

This creates `dist/tumbleweed.zip` from the explicit `RELEASE_FILES.txt` allowlist.
Runtime files, local data and Git history are never included by that command.
When adding public source files, add them deliberately to the allowlist.

## License

[MIT](LICENSE). The application source and original bundled SVG artwork use
the same license. Imported content remains subject to its own rights.
