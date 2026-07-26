# Changelog

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
