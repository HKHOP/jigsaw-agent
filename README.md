# Jigsaw Agent

Multi-turn AI chat with autonomous tool-calling capabilities. Built for developers who want an AI that can read, write, search, browse, run commands, and manage databases — all through natural conversation.

## Features

- **Multi-turn AI chat** with streaming responses and automatic loop detection
- **Autonomous tool calling** — the AI can read/write files, run commands, browse the web, query databases, and more
- **Dual AI providers** — choose your default provider (OpenRouter or Gemini), the other serves as automatic fallback
- **Per-thread model types** — Normal, Minecraft Expert, or Dumb Brain per conversation
- **Tool approval modes** — YOLO (full auto), Auto-Approve (smart), Manual (every tool asks)
- **Browser automation** — AI can navigate, click, fill forms, and take screenshots (headless or visible)
- **SQLite database management** — query, schema inspection, backups
- **Thread management** — create, rename, delete, compact conversations (with auto-compaction on large context)
- **Conversation compaction** — AI-powered summarization to stay within context windows; auto-triggers when context exceeds limits; survives restarts
- **Notification system** — in-app toast notifications for errors and events, with SSE-based live updates
- **File @mentions** — reference files and paths in your messages with autocomplete
- **Export** — threads to Markdown or JSON
- **Desktop app** — packaged with Electron (Windows installer)
- **Auto-updater** — Stable and Nightly release channels with progress bar

## Download

Get the latest release from the [Releases page](https://github.com/HKHOP/jigsaw-agent/releases).

## Usage

### Desktop app (recommended)
Download the installer from [Releases](https://github.com/HKHOP/jigsaw-agent/releases) and run it.

### Web-only (no Electron)
```bash
npm install
npm start
```
Then open `http://localhost:3000` in your browser.

### Settings

| Setting | Description |
|---|---|
| **Mode** | YOLO (auto-approve all), Auto-Approve (safe ops only), Manual (ask for each) |
| **Browser** | Show/hide the browser window when AI uses it |
| **API Keys** | OpenRouter and Gemini API keys, model selection, and default provider |
| **Updates** | Stable or Nightly release channel with manual update controls |
| **Tools** | Enable/disable individual tools |

API keys are managed entirely through the Settings UI — no `.env` file needed.

### Commands

Type `/` in the chat input to see available commands: `/export`, `/clear`, `/compact`, `/delete`.

## Development

```bash
npm install
npm run dev        # Web-only with auto-reload
npm run build:win  # Build Windows installer
```

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (served by Express)
- **Backend**: Express 5.x (Node.js), worker thread pool (CPU count-based)
- **Desktop**: Electron 35.x + electron-builder + NSIS
- **AI**: OpenRouter (default) + Google Gemini (fallback)
- **Browser automation**: Playwright
- **Database**: SQLite via sql.js

## Project Structure

| Path | Purpose |
|---|---|
| `index.js` | Express server, API routes, settings management, SSE notifications |
| `ai.js` | AI streaming and generation (OpenRouter + Gemini), conversation compaction |
| `tools.js` | Tool execution: file ops, commands, browser, database, clipboard, git |
| `worker.js` | Worker thread for thread/message persistence with file-locking |
| `browser-manager.js` | Playwright browser lifecycle management |
| `electron/` | Electron main process, preload, and auto-updater |
| `public/` | Client-side JS, CSS, and static assets |
| `views/index.html` | Single-page application UI |

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE).
