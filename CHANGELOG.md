# Changelog

## 1.2.0 — 2026-07-29

### Added
- Global default AI provider setting (Settings → API Keys → Default AI Provider) — choose OpenRouter or Gemini as primary; the other becomes fallback
- Compaction timestamp is now embedded in the compact message content so it persists across restarts
- Compaction system message now instructs the AI that prior messages are gone and it should re-read files / re-check state
- Auto-retry with compaction when AI call fails due to context overflow (e.g. large file reads exceeding the model's window)
- Compaction input is truncated to 100k characters (head + tail) before sending to the API, preventing request failures on oversized conversations
- Compaction falls back to Gemini if OpenRouter is unavailable (and vice versa), returns a placeholder summary if both fail

### Removed
- `/usefallback` command and per-thread `useGemini` toggle — replaced by global default provider setting

### Fixed
- `GEMINI_API_KEY not set` error on server restart — persisted API keys now populate `process.env` at startup
- Compaction showing `undefined` tokens/messages in the UI — added `?? 0` fallbacks
- Compaction running on tiny conversations (≤15 messages) giving bogus "Please provide the conversation..." summary — now returns early with no-op
- AI call crashing the entire SSE stream when messages exceed the model's context window — now caught, compacts, and retries once

## 1.1.1 — 2026-07-27

### Added
- Virtual scroll for chat — large conversations now only render messages near the viewport (window size: 150), automatically loading older batches when scrolling up and showing latest when at the bottom
- "Show N older messages" button appears at the top when older messages are hidden

### Changed
- All file system operations in tools.js converted from sync (fs, execSync) to async (fsp, execAsync) to prevent event loop blocking on large files or slow I/O
- Database operations in db-manager.js converted from sync to async (fsp.readFile/fsp.writeFile) for non-blocking reads and writes
- Chat message spacing changed from CSS `gap` to per-item `margin-top` for compatibility with virtual scroll elements

### Fixed
- `list_apps` and `open_app` now use try-catch instead of sync access checks for path existence

## 1.1.0 — 2026-07-27

### Added
- Elevated Permissions setting in Mode category — allows AI to access paths beyond project root
- Human-readable display names for all tools in approval popups and chat bubbles
- Collapsible command output for `run_command` — shows the command, stdout, and stderr in an expandable terminal-style section
- Update progress bar with download speed display in the update bar
- Manual update management in Settings → Updates (Check for Updates, Download, Restart & Install)
- Proper `update-not-available` and `update-error` event handling

### Changed
- File system tools now enforce project root boundary (access outside root is denied unless Elevated Permissions is on)
- Path handling is now case-insensitive and accepts both forward/backward slashes on Windows
- Root path is normalized consistently across all tools and API endpoints
- `inRootPath()` replaces the dead `checkPath()`/`denyCheck()` system
- Update download flow fixed — "Download" now calls `downloadUpdate()` instead of `quitAndInstall()`
- Dismissed update bar can be re-accessed from Settings → Updates

### Fixed
- `run_command` now correctly reports failure when a command exits with non-zero exit code
- Missing path validation added to `find_files`, `download_file`, `hash_file`, `crypto_utils`, `browser_screenshot`, and `open_app`
- `isToolUnsafe()` now properly normalizes rootPath instead of raw string manipulation

## 1.0.1 — 2026-07-26

### Fixed
- Packaged EXE could not create threads (Worker path was relative, broke in ASAR)
- Packaged EXE could not open settings on first run (data migration from project `data/` to Electron `userData` was missing)

## 1.0.0 — 2026-07-26

### Added
- Initial release
- Multi-turn AI chat with autonomous tool-calling
- OpenRouter and Gemini AI provider support
- Tool approval system (YOLO, Auto-Approve, Manual)
- Browser automation via Playwright
- SQLite database management
- File system tools (read, write, edit, search, etc.)
- Thread management (create, rename, fork, delete, compact)
- Markdown export with syntax highlighting
- Settings management (mode, browser visibility, tool toggles)
- Desktop build via Electron
