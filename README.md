# Mark Everything (ME)

A local bookmark library with a browser manager and optional WebDAV synchronization. Your library stays in a directory you choose. Search, organize, edit, import and export bookmarks without a Raindrop account.

**[Download releases](https://github.com/Schnee013/mark-everything/releases) · [Install ME](docs/INSTALL.md) · [Raycast companion](https://github.com/Schnee013/mark-everything-raycast) · [Report an issue](https://github.com/Schnee013/mark-everything/issues)**

The browser manager adapts the open-source Raindrop.io React interface. ME's data storage, versioned operations, conflict handling and WebDAV synchronization run in a separate local Python helper. This is an independent, personally maintained project, not an official Raindrop.io product or service. See [third-party notices](THIRD-PARTY-NOTICES.md) for the exact source and reuse boundaries.

## Features

- Collections, tags, favorites, notes, descriptions, covers and bookmark editing.
- Local full-text search with full pinyin and initials. New saves, imports, edits and incoming synchronization update the local index. Existing libraries can rebuild it from settings.
- Versioned writes, explicit conflicts, trash and HTML import/export.
- Optional WebDAV sync, including Nutstore. Credentials are stored through the system credential store by the main helper, not by the Raycast extension.
- Chrome/Edge browser manager and save popup; a separate Raycast companion for quick search, save and edit.

The current release includes a **macOS Apple Silicon (arm64)** helper and unpacked Chromium extensions. It is not an independently signed/notarized macOS app, and the browser extension is not listed in Chrome or Edge stores. The manager currently contains both English upstream interface text and Chinese local-operation prompts. See the installation guide for requirements and limitations.

## Source layout

| Directory | Responsibility |
| --- | --- |
| `app/src/co`, `routes`, `data`, `assets` | Raindrop-derived UI and local adaptations |
| `app/src/me` | ME browser adapters, command handling and local management UI |
| `helper` | Local file-based library, stdio/Native Messaging transport, search and sync |
| `scripts` | Build, package and installation tools |
| `docs/api-v1.d.ts` | Helper protocol contract distributed to the Raycast companion |

The two applications communicate through the existing helper protocol; the Raycast companion does not copy the data core or synchronization algorithm. Ordinary bookmark use has no always-on local HTTP service.

## Build

Use macOS arm64, Node.js 24, Python 3.9 or newer and Xcode Command Line Tools. The binary release was built with Python 3.9.6. Python and Node dependencies are separate:

```sh
cd app
npm ci --no-audit --no-fund
npm run build:me:chrome
npm run build:me:edge
cd ..
python3 -m venv .venv
.venv/bin/python -m pip install -r helper/requirements.txt pyinstaller==6.22.3
.venv/bin/python scripts/build-helper.py
.venv/bin/python scripts/package.py
```

The icon artwork and required resized PNGs are included. On macOS, `cd app && npm run icons` regenerates them with `sips`, without redrawing the supplied artwork. ME builds retain the upstream package version for provenance; the ME product version is in the extension manifest source and helper capabilities.

Run the focused helper index tests with `.venv/bin/python -m unittest discover -s helper/tests`. The release browser smoke is `app/tests/delivery-check.cjs`; set `ME_DELIVERY_PACKAGE` to the extracted release and `PLAYWRIGHT_MODULE` to an installed Playwright module. `ME_TEST_PYTHON` may select the Python environment with helper dependencies (default `.venv/bin/python`). It creates its own temporary library/config/profile and never needs your real library. Set `ME_DELIVERY_TEST_ROOT` to a disposable directory and remove it after reviewing the result.

## Privacy and support

Bookmark operations are local unless you configure WebDAV. Saving page metadata may read the page you selected. Displayed website icons, cover URLs and images in Markdown notes can contact their respective servers. WebDAV transfers bookmark contents to your chosen endpoint. The pinyin index is derived local data and is not uploaded.

Report reproducible problems in [GitHub Issues](https://github.com/Schnee013/mark-everything/issues). Remove bookmark contents, private URLs, credentials and local paths from reports. This project has no hosted account service or paid support commitment.

ME-owned changes use the [MIT license](LICENSE). Upstream components keep their original copyright notices and licenses; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Collection icons are bundled for offline use: 199 monochrome Raindrop SVGs and 32 color Twemoji SVGs. Change them in the ME manager; the Raycast companion displays the same choice. See [third-party notices](THIRD-PARTY-NOTICES.md) for the separate MIT and CC BY 4.0 attribution.
