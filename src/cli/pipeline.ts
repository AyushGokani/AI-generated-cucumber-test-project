#!/usr/bin/env node
import { runPipeline } from "../pipeline/run.js";
import { logger } from "../logger.js";

function parseArgs(argv: string[]) {
  const opts: {
    issueKey?: string;
    jql?: string;
    dryRun?: boolean;
    skipPr?: boolean;
    skipJiraUpdate?: boolean;
  } = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--issue" || arg === "-i") opts.issueKey = argv[++i];
    else if (arg === "--jql") opts.jql = argv[++i];
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--skip-pr") opts.skipPr = true;
    else if (arg === "--skip-jira") opts.skipJiraUpdate = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`Usage: npm run pipeline -- [options]

Options:
  -i, --issue <KEY>   Process a single Jira issue (e.g. PROJ-123)
  --jql <query>       Override default JQL search
  --dry-run           Generate files but do not push / open PR / update Jira
  --skip-pr           Write artifacts only (no GitHub PR)
  --skip-jira         Do not comment / transition the Jira issue
  -h, --help          Show this help

Examples:
  npm run pipeline:dry
  npm run pipeline -- --issue DEMO-101 --dry-run
  npm run pipeline -- --issue PROJ-42
`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const results = await runPipeline(opts);

  for (const r of results) {
    if (r.success) {
      logger.info(
        `✓ ${r.issueKey} → ${r.artifacts.length} artifacts` +
          (r.prUrl ? ` | PR: ${r.prUrl}` : r.dryRun ? " | dry-run" : ""),
      );
    } else {
      logger.error(`✗ ${r.issueKey}: ${r.error}`);
    }
  }

  const failed = results.filter((r) => !r.success).length;
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
