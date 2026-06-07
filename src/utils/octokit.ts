import { Octokit } from "@octokit/rest";
import chalk from "chalk";

export function createOctokit(token?: string): Octokit {
  const authToken = token || process.env.GITHUB_TOKEN;

  if (!authToken) {
    console.error(
      chalk.red(
        "Error: GitHub token is required. Provide it via --token flag or GITHUB_TOKEN environment variable."
      )
    );
    process.exit(1);
  }

  return new Octokit({ auth: authToken });
}
