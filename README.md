# release-janitor

A CLI tool to clean up Docker images in GitHub Container Registry (GHCR) and GitHub releases. Supports dry-run previews, flexible filtering by age, tag status, and release type, with colored table output and confirmation prompts before destructive actions.

## Installation

```bash
# Install globally
npm install -g release-janitor

# Or run without installing
npx release-janitor <command> [options]
```

## Authentication

All commands require a GitHub personal access token with appropriate permissions:

- **Images (GHCR)**: `read:packages` + `delete:packages`
- **Releases**: `repo` (or `public_repo` for public repositories only)

Set the token via environment variable (recommended) or the `--token` flag:

```bash
# Via environment variable
export GITHUB_TOKEN=ghp_yourtoken

# Via flag
release-janitor images -o myorg --token ghp_yourtoken
```

## Commands

### `images` — Clean up GHCR container image versions

```
release-janitor images [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --owner <owner>` | GitHub org or user name **(required)** | — |
| `-p, --package <name>` | Package name (omit to process all container packages) | all packages |
| `-t, --token <token>` | GitHub token (falls back to `GITHUB_TOKEN`) | — |
| `--dry-run` | Show what would be deleted without deleting | false |
| `--keep-latest <n>` | Keep N most recent versions per package | 5 |
| `--older-than <days>` | Only delete versions older than N days | — |
| `--untagged` | Only delete untagged/dangling versions | false |
| `-y, --yes` | Skip confirmation prompt | false |

#### Examples

```bash
# Preview what would be deleted across all packages (dry run)
release-janitor images -o myorg --dry-run

# Clean up a specific package, keeping the 3 most recent versions
release-janitor images -o myorg -p myimage --keep-latest 3

# Delete untagged images older than 30 days, skip confirmation
release-janitor images -o myorg --untagged --older-than 30 --yes

# Delete all versions older than 90 days (keep none with --keep-latest 0)
release-janitor images -o myorg -p myimage --older-than 90 --keep-latest 0 --yes

# Process packages owned by a user (not an org)
release-janitor images -o myuser -p myimage --keep-latest 10 --dry-run
```

---

### `releases` — Clean up GitHub releases

```
release-janitor releases [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --owner <owner>` | GitHub org or user name **(required)** | — |
| `-r, --repo <repo>` | Repository name **(required)** | — |
| `-t, --token <token>` | GitHub token (falls back to `GITHUB_TOKEN`) | — |
| `--dry-run` | Show what would be deleted without deleting | false |
| `--keep-latest <n>` | Keep N most recent releases | 5 |
| `--older-than <days>` | Only delete releases older than N days | — |
| `--drafts-only` | Only delete draft releases | false |
| `--pre-releases-only` | Only delete pre-releases | false |
| `-y, --yes` | Skip confirmation prompt | false |

#### Examples

```bash
# Preview what would be deleted (dry run)
release-janitor releases -o myorg -r myrepo --dry-run

# Keep only the 10 most recent releases
release-janitor releases -o myorg -r myrepo --keep-latest 10

# Delete all draft releases without keeping any, skip confirmation
release-janitor releases -o myorg -r myrepo --drafts-only --keep-latest 0 --yes

# Delete pre-releases older than 60 days
release-janitor releases -o myorg -r myrepo --pre-releases-only --older-than 60

# Delete everything older than 180 days without prompting
release-janitor releases -o myorg -r myrepo --older-than 180 --keep-latest 0 --yes
```

## Filter Logic

All filter flags work as **AND** conditions:

1. `--keep-latest N` — the N newest versions/releases are always excluded from deletion candidates
2. `--older-than <days>` — further filters candidates to only those older than N days
3. `--untagged` / `--drafts-only` / `--pre-releases-only` — further narrows the candidate set

**Example**: `--keep-latest 5 --older-than 30 --untagged` deletes only untagged images that are both beyond the 5 newest AND older than 30 days.

## Output

Before deleting, the tool displays a table of what will be affected:

```
Package: my-app

  Total versions: 12
  Will delete 7 version(s):
+------------+----------------------+------------------+------------+
| ID         | Name/Digest          | Tags             | Created    |
+------------+----------------------+------------------+------------+
| 123456789  | sha256:abc123def...  | v1.0.0, latest   | 2024-01-15 |
| 123456788  | sha256:bcd234efa...  | (untagged)       | 2024-01-10 |
+------------+----------------------+------------------+------------+

  Delete 7 version(s) from my-app? [y/N]
```

Color coding:
- **Green** — success messages
- **Red** — items to be deleted / errors
- **Yellow** — dry-run previews / warnings
- **Gray** — informational messages

## Development

```bash
# Install dependencies
npm install

# Run in development mode (no build step needed)
npm run dev -- images -o myorg --dry-run

# Build to dist/
npm run build

# Run the built binary
npm start -- releases -o myorg -r myrepo --dry-run
```

## License

MIT
