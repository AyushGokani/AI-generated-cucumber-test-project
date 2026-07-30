#!/usr/bin/env node
/**
 * Lightweight generate-only CLI (no PR / Jira updates).
 */
import { generateFromIssue } from "../generator/cucumber.js";
import { writeArtifacts } from "../git/pr.js";
import { getIssue, mockIssue } from "../jira/client.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

async function main(): Promise<void> {
  const issueKey = process.argv[2] || "DEMO-101";
  const issue = config.JIRA_API_TOKEN
    ? await getIssue(issueKey)
    : mockIssue(issueKey);

  const result = await generateFromIssue(issue);
  const written = await writeArtifacts(result);

  logger.info(`Generated ${result.artifacts.length} artifacts for ${issueKey}`);
  for (const p of written) logger.info(`  - ${p}`);
  if (result.assumptions.length) {
    logger.info("Assumptions:");
    result.assumptions.forEach((a) => logger.info(`  • ${a}`));
  }
}

main().catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
