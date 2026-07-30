import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { Octokit } from "@octokit/rest";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type { GeneratedArtifact, GenerationResult } from "../types.js";

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const GENERATED_ROOT = path.join(ROOT, "generated");

async function git(args: string[], cwd = ROOT): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

export function branchNameFor(issueKey: string): string {
  return `auto/cucumber-${issueKey.toLowerCase()}`;
}

export async function writeArtifacts(
  result: GenerationResult,
): Promise<string[]> {
  const written: string[] = [];
  const issueDir = path.join(GENERATED_ROOT, result.issueKey);

  for (const artifact of result.artifacts) {
    const abs = path.join(issueDir, artifact.relativePath);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, artifact.content, "utf8");
    written.push(abs);

    // Also mirror into the live cucumber suite so CI can run them after merge.
    const suitePath = path.join(ROOT, "tests", "cucumber", artifact.relativePath);
    await mkdir(path.dirname(suitePath), { recursive: true });
    await writeFile(suitePath, artifact.content, "utf8");
    written.push(suitePath);
  }

  const manifest = {
    issueKey: result.issueKey,
    featureName: result.featureName,
    summary: result.summary,
    assumptions: result.assumptions,
    tags: result.tags,
    generatedAt: new Date().toISOString(),
    artifacts: result.artifacts.map((a) => a.relativePath),
  };
  const manifestPath = path.join(issueDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  written.push(manifestPath);

  return written;
}

export function buildPrBody(
  result: GenerationResult,
  artifacts: GeneratedArtifact[],
): string {
  const fileList = artifacts
    .map((a) => `- \`${a.relativePath}\` (${a.kind})`)
    .join("\n");
  const assumptions = result.assumptions.length
    ? result.assumptions.map((a) => `- ${a}`).join("\n")
    : "- (none recorded)";

  return `## Auto-generated Cucumber tests for ${result.issueKey}

${result.summary}

> **Developer action required:** Review the feature + step definitions, adjust selectors if needed, then approve & merge. No other manual work is required.

### Jira
- Issue: **${result.issueKey}**
- Tags: ${result.tags.join(", ")}

### Generated files
${fileList}

### Assumptions made by the generator
${assumptions}

### How to verify locally
\`\`\`bash
npm install
npx playwright install chromium
npm run test:cucumber -- --tags @jira-${result.issueKey}
\`\`\`

---
*Opened by the Jira → Cucumber automation pipeline.*
`;
}

export interface PrResult {
  branchName: string;
  prNumber: number;
  prUrl: string;
}

export async function createPullRequest(
  result: GenerationResult,
  options: { dryRun?: boolean } = {},
): Promise<PrResult | { dryRun: true; branchName: string; body: string }> {
  const branch = branchNameFor(result.issueKey);
  const title = `test(${result.issueKey}): auto-generate Cucumber coverage`;
  const body = buildPrBody(result, result.artifacts);

  if (options.dryRun || config.DRY_RUN) {
    logger.info(`[dry-run] Would open PR: ${title}`);
    return { dryRun: true, branchName: branch, body };
  }

  if (!config.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is required to open PRs");
  }

  // Ensure files are committed on a dedicated branch.
  const base = config.GITHUB_BASE_BRANCH;
  await git(["fetch", "origin", base]).catch(() => undefined);

  // Create / reset branch from base
  const current = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  try {
    await git(["checkout", "-B", branch, `origin/${base}`]).catch(async () => {
      await git(["checkout", "-B", branch, base]);
    });

    await git(["add", "generated", "tests/cucumber"]);
    const status = await git(["status", "--porcelain"]);
    if (!status) {
      logger.warn("No changes to commit for PR");
    } else {
      await git([
        "commit",
        "-m",
        `test(${result.issueKey}): generate Cucumber feature and steps`,
      ]);
    }

    await git(["push", "-u", "origin", branch, "--force-with-lease"]);
  } finally {
    if (current && current !== branch) {
      await git(["checkout", current]).catch(() => undefined);
    }
  }

  const octokit = new Octokit({ auth: config.GITHUB_TOKEN });
  const { data: existing } = await octokit.pulls.list({
    owner: config.GITHUB_OWNER,
    repo: config.GITHUB_REPO,
    head: `${config.GITHUB_OWNER}:${branch}`,
    state: "open",
  });

  if (existing.length > 0) {
    const pr = existing[0];
    await octokit.pulls.update({
      owner: config.GITHUB_OWNER,
      repo: config.GITHUB_REPO,
      pull_number: pr.number,
      title,
      body,
    });
    logger.info(`Updated existing PR #${pr.number}`);
    return {
      branchName: branch,
      prNumber: pr.number,
      prUrl: pr.html_url,
    };
  }

  const { data: pr } = await octokit.pulls.create({
    owner: config.GITHUB_OWNER,
    repo: config.GITHUB_REPO,
    title,
    head: branch,
    base,
    body,
    draft: true,
  });

  logger.info(`Opened PR #${pr.number}: ${pr.html_url}`);
  return {
    branchName: branch,
    prNumber: pr.number,
    prUrl: pr.html_url,
  };
}

export async function readManifest(
  issueKey: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(
      path.join(GENERATED_ROOT, issueKey, "manifest.json"),
      "utf8",
    );
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
