import express from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { logger, setLogLevel } from "../logger.js";
import { runPipeline } from "../pipeline/run.js";

setLogLevel(config.LOG_LEVEL);

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "jira-cucumber-automation",
    llmMode: config.LLM_MODE,
    pollMinutes: config.POLL_INTERVAL_MINUTES,
  });
});

function verifySecret(req: express.Request): boolean {
  const header = req.header("x-webhook-secret") || req.header("x-automation-secret");
  if (!config.WEBHOOK_SECRET || config.WEBHOOK_SECRET === "change-me") {
    return true; // permissive in local/dev
  }
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(config.WEBHOOK_SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Jira Automation / webhook entrypoint.
 * Accepts either:
 *  - { issue: { key: "PROJ-1" } }  (Jira webhook shape)
 *  - { issueKey: "PROJ-1" }
 *  - { } → runs configured JQL search
 */
app.post("/webhooks/jira", async (req, res) => {
  if (!verifySecret(req)) {
    res.status(401).json({ error: "invalid webhook secret" });
    return;
  }

  const issueKey =
    req.body?.issue?.key ||
    req.body?.issueKey ||
    req.body?.key ||
    undefined;

  logger.info(`Webhook received${issueKey ? ` for ${issueKey}` : " (JQL batch)"}`);

  // Respond quickly; process async so Jira doesn't time out.
  res.status(202).json({ accepted: true, issueKey: issueKey ?? null });

  try {
    const results = await runPipeline({ issueKey });
    logger.info(
      `Webhook pipeline complete: ${results.filter((r) => r.success).length}/${results.length} ok`,
    );
  } catch (err) {
    logger.error("Webhook pipeline error", err);
  }
});

app.post("/api/run", async (req, res) => {
  if (!verifySecret(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const results = await runPipeline({
      issueKey: req.body?.issueKey,
      jql: req.body?.jql,
      dryRun: Boolean(req.body?.dryRun),
      skipPr: Boolean(req.body?.skipPr),
    });
    res.json({ results });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

function startPoller(): void {
  const minutes = config.POLL_INTERVAL_MINUTES;
  if (!minutes || minutes <= 0) {
    logger.info("Jira poller disabled (POLL_INTERVAL_MINUTES=0)");
    return;
  }
  const ms = minutes * 60_000;
  logger.info(`Jira poller every ${minutes} minute(s)`);
  const tick = async () => {
    try {
      logger.info("Poller tick — searching Jira");
      await runPipeline({});
    } catch (err) {
      logger.error("Poller error", err);
    }
  };
  void tick();
  setInterval(tick, ms);
}

const server = app.listen(config.PORT, () => {
  logger.info(`Automation server listening on :${config.PORT}`);
  startPoller();
});

function shutdown(): void {
  logger.info("Shutting down");
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
