#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { registerImagesCommand } from "./commands/images.js";
import { registerReleasesCommand } from "./commands/releases.js";

const program = new Command();

program
  .name("release-janitor")
  .description(
    "Clean up Docker images in GHCR (GitHub Container Registry) and GitHub releases"
  )
  .version("1.0.0");

registerImagesCommand(program);
registerReleasesCommand(program);

program.addHelpText(
  "after",
  `
Examples:
  ${chalk.cyan("# List/preview what would be deleted (dry run)")}
  release-janitor images -o myorg --dry-run
  release-janitor releases -o myorg -r myrepo --dry-run

  ${chalk.cyan("# Keep only the 3 most recent image versions")}
  release-janitor images -o myorg -p myimage --keep-latest 3

  ${chalk.cyan("# Delete untagged images older than 30 days")}
  release-janitor images -o myorg --untagged --older-than 30

  ${chalk.cyan("# Delete draft releases, skip confirmation")}
  release-janitor releases -o myorg -r myrepo --drafts-only --yes
`
);

program.parseAsync(process.argv).catch((err: unknown) => {
  const error = err as { message?: string };
  console.error(chalk.red(`Unexpected error: ${error.message ?? String(err)}`));
  process.exit(1);
});
