import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
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

interface FileEntry {
  relPath: string;
  content: string;
}

function buildFileSet(result: GenerationResult): FileEntry[] {
  const files: FileEntry[] = [];
  const issueRel = path.join("generated", result.issueKey);

  const supportShim = `/** Re-export for editor / typechecking under generated/<issue>/ */\nexport { CustomWorld } from "../../../tests/cucumber/support/world.js";\n`;
  files.push({ relPath: path.join(issueRel, "support", "world.ts"), content: supportShim });

  for (const artifact of result.artifacts) {
    files.push({
      relPath: path.join(issueRel, artifact.relativePath),
      content: artifact.content,
    });
    // Also mirror into the live cucumber suite so CI can run them after merge.
    files.push({
      relPath: path.join("tests", "cucumber", artifact.relativePath),
      content: artifact.content,
    });
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
  files.push({
    relPath: path.join(issueRel, "manifest.json"),
    content: JSON.stringify(manifest, null, 2),
  });

  return files;
}

async function writeFiles(baseDir: string, files: FileEntry[]): Promise<string[]> {
  const written: string[] = [];
  for (const f of files) {
    const abs = path.join(baseDir, f.relPath);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, f.content, "utf8");
    written.push(abs);
  }
  return written;
}

export async function writeArtifacts(
  result: GenerationResult,
): Promise<string[]> {
  return writeFiles(ROOT, buildFileSet(result));
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

async function ensureGitIdentity(): Promise<void> {
  try {
    await git(["config", "user.email"]);
  } catch {
    await git(["config", "user.email", "cucumber-bot@users.noreply.github.com"]);
  }
  try {
    await git(["config", "user.name"]);
  } catch {
    await git(["config", "user.name", "cucumber-automation-bot"]);
  }
}

/** Free up `branch` if it's already checked out in another worktree from a previous failed run. */
async function ensureBranchWorktreeFree(branch: string): Promise<void> {
  const list = await git(["worktree", "list", "--porcelain"]).catch(() => "");
  const blocks = list.split("\n\n");
  for (const block of blocks) {
    if (block.includes(`branch refs/heads/${branch}`)) {
      const pathLine = block.split("\n").find((l) => l.startsWith("worktree "));
      const wtPath = pathLine?.replace("worktree ", "").trim();
      if (wtPath) {
        await git(["worktree", "remove", "--force", wtPath]).catch(() => undefined);
      }
    }
  }
  await git(["worktree", "prune"]).catch(() => undefined);
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

  await ensureGitIdentity();

  const base = config.GITHUB_BASE_BRANCH;
  await git(["fetch", "origin", base]).catch(() => undefined);
  await ensureBranchWorktreeFree(branch);

  // Build the branch in an isolated worktree so the caller's own checkout,
  // branch, and any uncommitted local changes are never touched.
  const tmpDir = path.join(os.tmpdir(), `cucumber-pr-${result.issueKey}-${Date.now()}`);

  try {
    await git(["worktree", "add", "-B", branch, tmpDir, `origin/${base}`]);

    const files = buildFileSet(result);
    await writeFiles(tmpDir, files);

    await git(["add", "-A"], tmpDir);
    const status = await git(["status", "--porcelain"], tmpDir);
    if (!status) {
      logger.warn("No changes to commit for PR");
    } else {
      await git(
        [
          "commit",
          "-m",
          `test(${result.issueKey}): generate Cucumber feature and steps`,
        ],
        tmpDir,
      );
    }

    // Token-authenticated push (works without interactive git login).
    const remote = `https://x-access-token:${config.GITHUB_TOKEN}@github.com/${config.GITHUB_OWNER}/${config.GITHUB_REPO}.git`;
    await git(["push", remote, `HEAD:refs/heads/${branch}`, "--force"], tmpDir);
  } finally {
    await git(["worktree", "remove", "--force", tmpDir]).catch(() => undefined);
    await git(["worktree", "prune"]).catch(() => undefined);
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
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
