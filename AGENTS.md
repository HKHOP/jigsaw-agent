# Jigsaw Agent — Project Context

## Tech stack
- **Frontend**: Vanilla HTML/CSS/JS (no framework), served by Express
- **Backend**: Express 5.x (Node.js)
- **Desktop**: Electron 35.x + electron-builder + NSIS installer
- **AI**: OpenRouter (primary) + Google Gemini (fallback)
- **Other**: Playwright (browser automation), SQLite via sql.js
- **Authored by**: HKHOP

## Key files
| File | Purpose |
|---|---|
| `electron/main.js` | Electron main process, auto-updater |
| `electron/preload.js` | Context bridge for IPC (minimize, maximize, close, updates) |
| `index.js` | Express server, all API routes, settings read/write |
| `ai.js` | AI streaming (OpenRouter + Gemini) |
| `views/index.html` | Entire UI (SPA, no router, just show/hide) |
| `public/script.js` | All client-side JS (settings, chat, streaming, commands) |
| `public/style.css` | Dark theme styles |
| `data/settings.json` | Persisted settings (API keys, mode, tools, release channel) |
| `CHANGELOG.md` | Version history for release notes |
| `docs/release-workflow.md` | Docs on how stable/nightly releases work |
| `.github/workflows/release.yml` | CI for tagged stable releases |
| `.github/workflows/nightly.yml` | CI for nightly builds on main pushes |

## Settings (stored in data/settings.json)
- **Mode**: yoloMode / autoApprove / manual (radio buttons)
- **Browser**: browserHeadless (checkbox, inverted logic)
- **API Keys**: openrouterKey, openrouterModel, geminiKey, geminiModel
- **Release Channel**: releaseChannel ('stable' | 'nightly')
- **Tools**: per-tool { enabled } map

## Settings UI
- Full-page settings (replaces #main), not a modal
- Categories: Mode, Browser, API Keys, Updates, Tools
- Category switching via switchSettingsCat() — shows/hides panels
- Changelog fetched from GitHub raw on "Updates" tab click

## Auto-updater (electron-updater)
- Stable channel: checks GitHub releases for tagged versions
- Nightly channel: checks the "nightly" pre-release (versioned as x.y.z-nightly.YYYYMMDD.RUN)
- Channel read from settings.json on startup by getReleaseChannel()
- Blue update bar shown in UI when update is available
- Download on user click, then Restart & Install button

## Release process
See `docs/release-workflow.md` for full details.
- **Stable**: bump version in package.json, update CHANGELOG.md, tag v* and push
- **Nightly**: automatic on every push to main

## Important conventions
- .env file is deleted — API keys managed through Settings UI
- All modals (export, approve, ask, confirm) use fixed positioning with overlays
- The settings page is position:absolute inside body, #main gets .hidden when settings open
- All file paths in the codebase use forward-slash or path.join — be careful with Windows paths
