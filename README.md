# Jigsaw Agent

Multi-turn AI chat with autonomous tool-calling capabilities. Built for developers who want an AI that can read, write, search, browse, run commands, and manage databases — all through natural conversation.

## Features

- **Multi-turn AI chat** with streaming responses
- **Autonomous tool calling** — the AI can read/write files, run commands, browse the web, query databases, and more
- **Dual AI providers** — OpenRouter (primary) + Google Gemini (fallback)
- **Per-thread model switching** — assign different AI models to different conversations
- **Tool approval modes** — YOLO (full auto), Auto-Approve (smart), Manual (every tool asks)
- **Browser automation** — AI can navigate, click, fill forms, and take screenshots
- **SQLite database management** — query, schema inspection, backups
- **Thread management** — create, rename, fork, delete, compact conversations
- **Export** — threads to Markdown or JSON
- **Desktop app** — packaged with Electron (Windows installer)
- **Auto-updater** — Stable and Nightly release channels

## Download

Get the latest stable release from the [Releases page](https://github.com/HKHOP/jigsaw-agent/releases).

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
| **API Keys** | OpenRouter and Gemini API keys and model selection |
| **Updates** | Stable or Nightly release channel |
| **Tools** | Enable/disable individual tools |

API keys are managed entirely through the Settings UI — no `.env` file needed.

## Development

```bash
npm install
npm run dev        # Web-only with auto-reload
npm run build:win  # Build Windows installer
```

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (served by Express)
- **Backend**: Express 5.x (Node.js)
- **Desktop**: Electron 35.x + electron-builder + NSIS
- **AI**: OpenRouter (primary) + Google Gemini (fallback)
- **Browser automation**: Playwright
- **Database**: SQLite via sql.js

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE).
