# Release Workflow

This project has two release channels: **Stable** and **Nightly**.

## Channels

| Channel | When it updates | Stability |
|---------|----------------|-----------|
| **Stable** | Only when a new `v*` tag is pushed | Fully tested, recommended for most users |
| **Nightly** | Every push to `main` | Latest code, may be unstable |

Users select their channel in **Settings → Updates → Release Channel**.

---

## How to make a Stable release

1. Update `CHANGELOG.md`:
   - Add a new `## X.Y.Z — YYYY-MM-DD` entry at the top
   - List all changes under `### Added`, `### Changed`, `### Fixed` as appropriate

2. Update version in `package.json`

3. Commit and tag:
   ```bash
   git add -A
   git commit -m "vX.Y.Z"
   git tag vX.Y.Z
   git push && git push --tags
   ```

4. The **Stable Release** GitHub Actions workflow (`.github/workflows/release.yml`) automatically:
   - Builds the Windows installer
   - Creates a GitHub Release with release notes from the Git tags
   - Uploads the installer as a release asset

5. The auto-updater in the app will detect the new version on next startup (if the user is on the Stable channel).

---

## How Nightly releases work

- Every push to `main` triggers the **Nightly Build** workflow (`.github/workflows/nightly.yml`)
- It automatically:
  1. Reads the version from `package.json`
  2. Appends `-nightly.<date>.<run-number>` (e.g. `1.0.0-nightly.20260726.1`)
  3. Builds the installer
  4. Deletes the old "nightly" release
  5. Creates a new "nightly" prerelease with the commit log as release notes

- No manual steps needed — just push to `main`.

---

## How to make a Changelog entry

Always update `CHANGELOG.md` when making notable changes to the codebase.

### Format

```markdown
## X.Y.Z — YYYY-MM-DD

### Added
- New feature description

### Changed
- Change to existing feature

### Fixed
- Bug fix description

### Removed
- Feature removed
```

### Version numbering

- **Stable** versions: `major.minor.patch` (semver)
- **Nightly** versions: `major.minor.patch-nightly.YYYYMMDD.RUN` (auto-generated)

---

## Changelog display in the app

The **Settings → Updates** panel fetches `CHANGELOG.md` from the GitHub repo's raw URL and displays it. This lets users see what's new before deciding to update.

---

## CI/CD Workflows

### `.github/workflows/release.yml`
- Trigger: push of a `v*` tag
- Runs on: `windows-latest`
- Steps: checkout → setup Node → `npm ci` → build → create GitHub Release with installer

### `.github/workflows/nightly.yml`
- Trigger: push to `main` branch
- Runs on: `windows-latest`
- Steps: checkout → setup Node → set nightly version → `npm ci` → build → delete old nightly release → create new nightly prerelease → upload installer
