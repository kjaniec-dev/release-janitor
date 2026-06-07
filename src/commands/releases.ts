import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createOctokit } from "../utils/octokit.js";
import { printTable, formatDate } from "../utils/table.js";
import { confirm } from "../utils/prompt.js";

interface ReleasesOptions {
  owner: string;
  repo: string;
  token?: string;
  dryRun: boolean;
  keepLatest: string;
  olderThan?: string;
  draftsOnly: boolean;
  preReleasesOnly: boolean;
  yes: boolean;
}

interface Release {
  id: number;
  tag_name: string;
  name: string | null;
  published_at: string | null;
  created_at: string;
  draft: boolean;
  prerelease: boolean;
}

async function listAllReleases(
  octokit: ReturnType<typeof createOctokit>,
  owner: string,
  repo: string
): Promise<Release[]> {
  const releases: Release[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await octokit.repos.listReleases({
      owner,
      repo,
      per_page: perPage,
      page,
    });

    releases.push(
      ...response.data.map((r) => ({
        id: r.id,
        tag_name: r.tag_name,
        name: r.name,
        published_at: r.published_at,
        created_at: r.created_at,
        draft: r.draft,
        prerelease: r.prerelease,
      }))
    );

    if (response.data.length < perPage) break;
    page++;
  }

  return releases;
}

function filterReleases(releases: Release[], opts: ReleasesOptions): Release[] {
  // Sort by published_at / created_at descending (newest first)
  const sorted = [...releases].sort((a, b) => {
    const aDate = a.published_at ?? a.created_at;
    const bDate = b.published_at ?? b.created_at;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });

  const keepLatest = parseInt(opts.keepLatest, 10);
  let candidates = sorted.slice(keepLatest);

  // Apply --older-than (AND)
  if (opts.olderThan !== undefined) {
    const days = parseInt(opts.olderThan, 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    candidates = candidates.filter((r) => {
      const date = new Date(r.published_at ?? r.created_at);
      return date < cutoff;
    });
  }

  // Apply --drafts-only (AND)
  if (opts.draftsOnly) {
    candidates = candidates.filter((r) => r.draft);
  }

  // Apply --pre-releases-only (AND)
  if (opts.preReleasesOnly) {
    candidates = candidates.filter((r) => r.prerelease);
  }

  return candidates;
}

export function registerReleasesCommand(program: Command): void {
  program
    .command("releases")
    .description("Clean up GitHub releases for a repository")
    .requiredOption("-o, --owner <owner>", "GitHub org or user name")
    .requiredOption("-r, --repo <repo>", "Repository name")
    .option("-t, --token <token>", "GitHub token (falls back to GITHUB_TOKEN env var)")
    .option("--dry-run", "Show what would be deleted without deleting", false)
    .option("--keep-latest <n>", "Keep N most recent releases", "5")
    .option("--older-than <days>", "Only delete releases older than N days")
    .option("--drafts-only", "Only delete draft releases", false)
    .option("--pre-releases-only", "Only delete pre-releases", false)
    .option("-y, --yes", "Skip confirmation prompt", false)
    .action(async (opts: ReleasesOptions) => {
      const octokit = createOctokit(opts.token);

      // Fetch releases
      const fetchSpinner = ora(
        chalk.gray(`Fetching releases for ${opts.owner}/${opts.repo}...`)
      ).start();

      let releases: Release[];
      try {
        releases = await listAllReleases(octokit, opts.owner, opts.repo);
        fetchSpinner.stop();
      } catch (err: unknown) {
        fetchSpinner.stop();
        const error = err as { status?: number; message?: string };
        if (error.status === 404) {
          console.error(
            chalk.red(`Error: Repository "${opts.owner}/${opts.repo}" not found.`)
          );
        } else {
          console.error(chalk.red(`Error fetching releases: ${error.message}`));
        }
        process.exit(1);
      }

      console.log(chalk.gray(`Total releases found: ${releases.length}`));

      if (releases.length === 0) {
        console.log(chalk.green("No releases found. Nothing to do."));
        return;
      }

      const toDelete = filterReleases(releases, opts);

      if (toDelete.length === 0) {
        console.log(chalk.green("Nothing to delete based on the current filters."));
        return;
      }

      // Build table rows
      const rows = toDelete.map((r) => ({
        id: String(r.id),
        tag: r.tag_name,
        name: (r.name ?? "").slice(0, 30),
        published: r.published_at ? formatDate(r.published_at) : chalk.gray("(draft)"),
        draft: r.draft ? chalk.yellow("yes") : "no",
        pre: r.prerelease ? chalk.yellow("yes") : "no",
      }));

      console.log(
        opts.dryRun
          ? chalk.yellow(`\nWould delete ${toDelete.length} release(s):`)
          : chalk.red(`\nDeleting ${toDelete.length} release(s):`)
      );

      printTable(rows, [
        { header: "ID", key: "id" },
        { header: "Tag", key: "tag" },
        { header: "Name", key: "name" },
        { header: "Published", key: "published" },
        { header: "Draft", key: "draft" },
        { header: "Pre-release", key: "pre" },
      ]);

      if (opts.dryRun) {
        console.log(
          chalk.yellow(`\n[Dry run] Would delete ${toDelete.length} release(s). No changes made.`)
        );
        return;
      }

      // Confirm unless --yes
      if (!opts.yes) {
        const ok = await confirm(
          chalk.yellow(`\nDelete ${toDelete.length} release(s) from ${opts.owner}/${opts.repo}?`)
        );
        if (!ok) {
          console.log(chalk.gray("Aborted."));
          return;
        }
      }

      // Delete with progress
      const deleteSpinner = ora(chalk.gray("Deleting releases...")).start();
      let deleted = 0;
      let errors = 0;

      for (const release of toDelete) {
        try {
          await octokit.repos.deleteRelease({
            owner: opts.owner,
            repo: opts.repo,
            release_id: release.id,
          });
          deleted++;
          deleteSpinner.text = chalk.gray(
            `Deleting releases... ${deleted}/${toDelete.length}`
          );
        } catch (err: unknown) {
          const error = err as { message?: string };
          errors++;
          deleteSpinner.stop();
          console.error(
            chalk.red(
              `Failed to delete release ${release.tag_name} (id: ${release.id}): ${error.message}`
            )
          );
          deleteSpinner.start();
        }
      }

      deleteSpinner.stop();

      // Summary
      console.log();
      if (errors === 0) {
        console.log(
          chalk.green(`Done. Successfully deleted ${deleted} release(s).`)
        );
      } else {
        console.log(
          chalk.yellow(`Done. Deleted ${deleted} release(s), ${errors} failed.`)
        );
        process.exit(1);
      }
    });
}
