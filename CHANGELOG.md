# Changelog

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
