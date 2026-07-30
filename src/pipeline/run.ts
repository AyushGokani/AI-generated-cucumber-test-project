import { config, assertLiveIntegrations } from "../config.js";
import { generateFromIssue } from "../generator/cucumber.js";
import {
  addComment,
  getIssue,
  mockIssue,
  searchIssues,
  transitionIssue,
} from "../jira/client.js";
import { createPullRequest, writeArtifacts } from "../git/pr.js";
import { logger, setLogLevel } from "../logger.js";
import type { JiraIssue, PipelineOptions, PipelineResult } from "../types.js";

setLogLevel(config.LOG_LEVEL);

async function resolveIssues(options: PipelineOptions): Promise<JiraIssue[]> {
  const hasJira = Boolean(config.JIRA_API_TOKEN);

  if (options.issueKey) {
    if (!hasJira) {
      logger.warn("No JIRA_API_TOKEN — using mock issue payload");
      return [mockIssue(options.issueKey)];
    }
    return [await getIssue(options.issueKey)];
  }

  if (!hasJira) {
    logger.warn("No JIRA_API_TOKEN — using mock DEMO-101 issue");
    return [mockIssue("DEMO-101")];
  }

  return searchIssues(options.jql);
}

async function processIssue(
  issue: JiraIssue,
  options: PipelineOptions,
): Promise<PipelineResult> {
  const dryRun = options.dryRun ?? config.DRY_RUN;
  logger.info(`Processing ${issue.key}: ${issue.summary}`);

  try {
    const generation = await generateFromIssue(issue);
    await writeArtifacts(generation);

    let prUrl: string | undefined;
    let prNumber: number | undefined;
    let branchName: string | undefined;

    if (!options.skipPr) {
      const pr = await createPullRequest(generation, { dryRun });
      branchName = pr.branchName;
      if ("prUrl" in pr) {
        prUrl = pr.prUrl;
        prNumber = pr.prNumber;
      }
    }

    if (!dryRun && !options.skipJiraUpdate && config.JIRA_API_TOKEN) {
      const comment = prUrl
        ? `Automation opened a draft PR for Cucumber coverage: ${prUrl}\nPlease review the generated feature + steps, then approve & merge.`
        : `Cucumber artifacts generated for ${issue.key} (no PR opened).`;
      try {
        await addComment(issue.key, comment);
        await transitionIssue(issue.key, config.JIRA_TRANSITION_IN_REVIEW);
      } catch (err) {
        logger.warn(`Jira update failed for ${issue.key}`, err);
      }
    }

    return {
      issueKey: issue.key,
      success: true,
      dryRun,
      branchName,
      prUrl,
      prNumber,
      artifacts: generation.artifacts,
      assumptions: generation.assumptions,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Pipeline failed for ${issue.key}: ${message}`);
    return {
      issueKey: issue.key,
      success: false,
      dryRun,
      artifacts: [],
      assumptions: [],
      error: message,
    };
  }
}

export async function runPipeline(
  options: PipelineOptions = {},
): Promise<PipelineResult[]> {
  const dryRun = options.dryRun ?? config.DRY_RUN;

  if (!dryRun && config.JIRA_API_TOKEN) {
    try {
      assertLiveIntegrations();
    } catch (err) {
      // Allow generate-only / skip-pr flows without full credentials.
      if (!options.skipPr) throw err;
      logger.warn(String(err));
    }
  }

  const issues = await resolveIssues(options);
  if (!issues.length) {
    logger.info("No matching Jira issues found");
    return [];
  }

  const results: PipelineResult[] = [];
  for (const issue of issues) {
    results.push(await processIssue(issue, options));
  }
  return results;
}
