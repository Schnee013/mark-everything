# Third-party notices and reuse boundaries

## Raindrop.io application

ME adapts the actual source of [raindropio/app](https://github.com/raindropio/app), pinned at **94ba9cbb88002987ed49cbc3848c93d396ae47a1**. The original code is MIT licensed, copyright 2024 Rustem Mussabekov. The complete original notice is preserved verbatim in [app/LICENSE.md](app/LICENSE.md), and is included as `licenses/raindrop.txt` in built browser extensions and release packages.

The reused source includes React components, layouts, styles, assets, routes, state management and browser-extension build scaffolding under `app/`. ME modifications connect that interface through `app/src/me/` and the adapted data/extension entry points to the local helper. The upstream account, subscription, AI, sharing and cloud API flows are not provided by ME. Some upstream utilities and alternate target source remain for source provenance; only the ME Chrome/Edge builds are supported.

`helper/` implements ME's existing local library, versioned operations, conflict handling and optional WebDAV synchronization. It is not Raindrop's server implementation. ME does not connect to a Raindrop account, operate a Raindrop REST client or bundle proprietary Raindrop services. Raindrop.io's name identifies the upstream source; ME's project name and supplied icons are separate. There is no affiliation, endorsement or claim of ownership over upstream code.

The root MIT license covers ME-owned work and does not replace upstream copyright notices or grant rights to third-party trademarks.

## Raycast companion

The separate [mark-everything-raycast](https://github.com/Schnee013/mark-everything-raycast) repository adapts the Raindrop.io extension in **raycast/extensions**, pinned at `4cd99da7dfe0dbe794f371f7ec59550d52558c2b`. That is a distinct upstream source (MIT, copyright 2021 Raycast), documented in its own [per-file notice](https://github.com/Schnee013/mark-everything-raycast/blob/main/THIRD-PARTY-NOTICES.md). This main repository does not substitute the app's license for the companion's notice.

## Bookmarker

`app/src/me/content-type.js` adapts only `detectType` and `safeHostname` from [istefox/obsidian-bookmarker](https://github.com/istefox/obsidian-bookmarker/blob/de60b974c01b808e92a95f97c291a3fd7e086beb/src/metadata.ts), version 0.1.30, commit `de60b974c01b808e92a95f97c291a3fd7e086beb`. TypeScript annotations were removed. The full MIT notice, copyright 2026 Stefano Ferri, is preserved in `app/src/me/licenses/bookmarker.txt` and distributed in release licenses.

## Dependencies

The browser app uses the packages locked in `app/package-lock.json`, including React, React Diff Viewer Continued and their dependencies. Build output carries dependency notices under `licenses/`. The helper uses Python, keyring and pypinyin; the frozen distribution includes their license texts and the build environment's third-party notices. PyInstaller's license includes its bootloader distribution exception. The release contains these notices alongside the relevant components.

## Twemoji color collection icons

32 files named `twemoji-*.svg` are selected from [jdecked/twemoji v17.0.3](https://github.com/jdecked/twemoji/tree/b6b55fef1e8636b540a6d016a4729ca8cdf2e60b), commit `b6b55fef1e8636b540a6d016a4729ca8cdf2e60b`. Graphics by Twitter, Inc. and other contributors are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), separately from the project's MIT code. SVG bytes are unchanged; only filenames are descriptive local names. No Twemoji parser, CDN or runtime account dependency is included. These are alternative choices, not a restoration of privately selected Raindrop online images.

The full notice is in `app/src/me/licenses/twemoji.txt` and ships as `licenses/twemoji.txt` in both browser builds. `twemoji-source.json` beside it records every source path and SHA-256.
