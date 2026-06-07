import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createOctokit } from "../utils/octokit.js";
import { printTable, formatDate } from "../utils/table.js";
import { confirm } from "../utils/prompt.js";
import type { Octokit } from "@octokit/rest";

interface ImagesOptions {
  owner: string;
  package?: string;
  token?: string;
  dryRun: boolean;
  keepLatest: string;
  olderThan?: string;
  untagged: boolean;
  yes: boolean;
}

interface PackageVersion {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  metadata?: {
    container?: {
      tags: string[];
    };
  };
}

async function isOrg(octokit: Octokit, owner: string): Promise<boolean> {
  try {
    await octokit.orgs.get({ org: owner });
    return true;
  } catch {
    return false;
  }
}

async function getPackageVersions(
  octokit: Octokit,
  owner: string,
  packageName: string,
  useOrg: boolean
): Promise<PackageVersion[]> {
  const versions: PackageVersion[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    try {
      let response;
      if (useOrg) {
        response = await octokit.packages.getAllPackageVersionsForPackageOwnedByOrg({
          package_type: "container",
          package_name: packageName,
          org: owner,
          per_page: perPage,
          page,
          state: "active",
        });
      } else {
        response = await octokit.packages.getAllPackageVersionsForPackageOwnedByUser({
          package_type: "container",
          package_name: packageName,
          username: owner,
          per_page: perPage,
          page,
          state: "active",
        });
      }

      versions.push(...(response.data as PackageVersion[]));

      if (response.data.length < perPage) break;
      page++;
    } catch (err: unknown) {
      const error = err as { status?: number; message?: string };
      if (error.status === 404) {
        throw new Error(`Package "${packageName}" not found for ${owner}.`);
      }
      throw err;
    }
  }

  return versions;
}

async function listContainerPackages(
  octokit: Octokit,
  owner: string,
  useOrg: boolean
): Promise<string[]> {
  const names: string[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    try {
      let response;
      if (useOrg) {
        response = await octokit.packages.listPackagesForOrganization({
          package_type: "container",
          org: owner,
          per_page: perPage,
          page,
        });
      } else {
        response = await octokit.packages.listPackagesForUser({
          package_type: "container",
          username: owner,
          per_page: perPage,
          page,
        });
      }

      names.push(...response.data.map((p) => p.name));

      if (response.data.length < perPage) break;
      page++;
    } catch (err: unknown) {
      const error = err as { status?: number; message?: string };
      if (error.status === 404) {
        return [];
      }
      throw err;
    }
  }

  return names;
}

async function deleteVersion(
  octokit: Octokit,
  owner: string,
  packageName: string,
  versionId: number,
  useOrg: boolean
): Promise<void> {
  if (useOrg) {
    await octokit.packages.deletePackageVersionForOrg({
      package_type: "container",
      package_name: packageName,
      org: owner,
      package_version_id: versionId,
    });
  } else {
    await octokit.packages.deletePackageVersionForUser({
      package_type: "container",
      package_name: packageName,
      username: owner,
      package_version_id: versionId,
    });
  }
}

function filterVersions(
  versions: PackageVersion[],
  opts: ImagesOptions
): PackageVersion[] {
  // Sort by created_at descending (newest first)
  const sorted = [...versions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const keepLatest = parseInt(opts.keepLatest, 10);
  // Versions to potentially delete = everything beyond the N newest
  let candidates = sorted.slice(keepLatest);

  // Apply --older-than filter (AND)
  if (opts.olderThan !== undefined) {
    const days = parseInt(opts.olderThan, 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    candidates = candidates.filter(
      (v) => new Date(v.created_at) < cutoff
    );
  }

  // Apply --untagged filter (AND)
  if (opts.untagged) {
    candidates = candidates.filter((v) => {
      const tags = v.metadata?.container?.tags ?? [];
      return tags.length === 0;
    });
  }

  return candidates;
}

export function registerImagesCommand(program: Command): void {
  program
    .command("images")
    .description("Clean up container image versions in GHCR")
    .requiredOption("-o, --owner <owner>", "GitHub org or user name")
    .option("-p, --package <name>", "Package name (omit to process all container packages)")
    .option("-t, --token <token>", "GitHub token (falls back to GITHUB_TOKEN env var)")
    .option("--dry-run", "Show what would be deleted without deleting", false)
    .option("--keep-latest <n>", "Keep N most recent versions per package", "5")
    .option("--older-than <days>", "Only delete versions older than N days")
    .option("--untagged", "Only delete untagged/dangling versions", false)
    .option("-y, --yes", "Skip confirmation prompt", false)
    .action(async (opts: ImagesOptions) => {
      const octokit = createOctokit(opts.token);

      // Resolve org vs user once upfront
      const resolveSpinner = ora(chalk.gray(`Resolving ${opts.owner}...`)).start();
      const useOrg = await isOrg(octokit, opts.owner);
      resolveSpinner.stop();

      // Determine which packages to process
      let packageNames: string[];

      if (opts.package) {
        packageNames = [opts.package];
      } else {
        const spinner = ora(chalk.gray(`Listing container packages for ${opts.owner}...`)).start();
        try {
          packageNames = await listContainerPackages(octokit, opts.owner, useOrg);
          spinner.stop();
        } catch (err: unknown) {
          spinner.stop();
          const error = err as { message?: string };
          console.error(chalk.red(`Error listing packages: ${error.message}`));
          process.exit(1);
        }

        if (packageNames.length === 0) {
          console.log(chalk.yellow(`No container packages found for ${opts.owner}.`));
          return;
        }

        console.log(
          chalk.gray(
            `Found ${packageNames.length} container package(s): ${packageNames.join(", ")}`
          )
        );
      }

      let totalToDelete = 0;
      let totalDeleted = 0;
      let totalErrors = 0;

      for (const packageName of packageNames) {
        console.log(chalk.bold(`\nPackage: ${chalk.cyan(packageName)}`));

        // Fetch versions
        const fetchSpinner = ora(chalk.gray("  Fetching versions...")).start();
        let versions: PackageVersion[];
        try {
          versions = await getPackageVersions(octokit, opts.owner, packageName, useOrg);
          fetchSpinner.stop();
        } catch (err: unknown) {
          fetchSpinner.stop();
          const error = err as { message?: string };
          console.error(chalk.red(`  Error: ${error.message}`));
          continue;
        }

        console.log(chalk.gray(`  Total versions: ${versions.length}`));

        const toDelete = filterVersions(versions, opts);

        if (toDelete.length === 0) {
          console.log(chalk.green("  Nothing to delete."));
          continue;
        }

        totalToDelete += toDelete.length;

        // Build table rows
        const rows = toDelete.map((v) => {
          const tags = v.metadata?.container?.tags ?? [];
          return {
            id: String(v.id),
            name: v.name.slice(0, 20),
            tags: tags.length > 0 ? tags.join(", ") : chalk.gray("(untagged)"),
            created: formatDate(v.created_at),
          };
        });

        console.log(
          opts.dryRun
            ? chalk.yellow(`  Would delete ${toDelete.length} version(s):`)
            : chalk.red(`  Will delete ${toDelete.length} version(s):`)
        );

        printTable(rows, [
          { header: "ID", key: "id" },
          { header: "Name/Digest", key: "name" },
          { header: "Tags", key: "tags" },
          { header: "Created", key: "created" },
        ]);

        if (opts.dryRun) {
          continue;
        }

        // Confirm unless --yes
        if (!opts.yes) {
          const ok = await confirm(
            chalk.yellow(`  Delete ${toDelete.length} version(s) from ${packageName}?`)
          );
          if (!ok) {
            console.log(chalk.gray("  Skipped."));
            continue;
          }
        }

        // Delete with spinner
        const deleteSpinner = ora(chalk.gray(`  Deleting 0/${toDelete.length}...`)).start();
        let deleted = 0;
        let errors = 0;

        for (const version of toDelete) {
          try {
            await deleteVersion(octokit, opts.owner, packageName, version.id, useOrg);
            deleted++;
            deleteSpinner.text = chalk.gray(`  Deleting ${deleted}/${toDelete.length}...`);
          } catch (err: unknown) {
            const error = err as { message?: string };
            errors++;
            deleteSpinner.stop();
            console.error(
              chalk.red(`  Failed to delete version ${version.id}: ${error.message}`)
            );
            deleteSpinner.start();
          }
        }

        deleteSpinner.stop();
        totalDeleted += deleted;
        totalErrors += errors;

        if (errors === 0) {
          console.log(chalk.green(`  Deleted ${deleted} version(s) successfully.`));
        } else {
          console.log(
            chalk.yellow(`  Deleted ${deleted} version(s), ${errors} error(s).`)
          );
        }
      }

      // Summary
      console.log();
      if (opts.dryRun) {
        console.log(
          chalk.yellow(
            `[Dry run] Would delete ${totalToDelete} version(s) across ${packageNames.length} package(s).`
          )
        );
      } else {
        if (totalToDelete === 0) {
          console.log(chalk.green("Nothing to delete."));
        } else if (totalErrors === 0) {
          console.log(chalk.green(`Summary: Deleted ${totalDeleted} version(s) successfully.`));
        } else {
          console.log(
            chalk.yellow(
              `Summary: Deleted ${totalDeleted} version(s). ${totalErrors} deletion(s) failed.`
            )
          );
        }
      }
    });
}
