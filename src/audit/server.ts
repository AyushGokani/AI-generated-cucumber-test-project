import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONTROL_CATALOG } from "./catalog.js";
import { buildReport, reportFileName } from "./report.js";
import { DOMAIN_ORDER, FRAMEWORK_LABELS, ISO_LABELS, NIST_LABELS, SOC2_LABELS, SOX_LABELS, SOX_SHORT } from "./references.js";
import { evaluateSample, planSample, presetForRisk } from "./sampling.js";
import { buildSampleEngagement } from "./seed.js";
import { createFileStore, type Store } from "./store.js";
import type { Engagement } from "./types.js";
import { FRAMEWORKS } from "./types.js";
import {
  HttpError,
  createEngagementSchema,
  draftSchema,
  parseBody,
  parseEngagement,
  presetSchema,
  sampleEvaluationSchema,
  samplePlanSchema,
  testInputSchema,
} from "./validate.js";
import {
  addMappedControls,
  applyTest,
  buildTestRecord,
  createBlankEngagement,
  draftFinding,
  generateRequests,
  newId,
  summarize,
  todayISO,
} from "./workpapers.js";
import { logger } from "../logger.js";

export function createAuditApp(store: Store): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "fieldnote", today: todayISO() });
  });

  app.get("/api/catalog", (_req, res) => {
    res.json({
      controls: CONTROL_CATALOG,
      domains: DOMAIN_ORDER,
      frameworks: FRAMEWORKS.map((id) => ({ id, ...FRAMEWORK_LABELS[id] })),
      references: {
        sox: Object.fromEntries(
          Object.entries(SOX_LABELS).map(([id, label]) => [id, { label, short: SOX_SHORT[id as keyof typeof SOX_SHORT] }]),
        ),
        soc2: SOC2_LABELS,
        iso: ISO_LABELS,
        nist: NIST_LABELS,
      },
    });
  });

  app.get("/api/engagements", (_req, res) => {
    res.json({ engagements: store.list() });
  });

  app.post("/api/engagements", (req, res) => {
    const body = parseBody(createEngagementSchema, req.body);
    let created;
    try {
      created = createBlankEngagement(body);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "Could not create the engagement.");
    }
    const saved = store.save(parseEngagement(created));
    res.status(201).json(present(saved));
  });

  app.post("/api/sample-engagement", (_req, res) => {
    const sample = buildSampleEngagement();
    const names = new Set(store.list().map((engagement) => engagement.name));
    sample.id = newId("eng");
    if (names.has(sample.name)) sample.name = `${sample.name} (copy)`;
    const saved = store.save(parseEngagement(sample));
    res.status(201).json(present(saved));
  });

  app.get("/api/engagements/:id", (req, res) => {
    res.json(present(mustGet(store, req.params.id)));
  });

  app.put("/api/engagements/:id", (req, res) => {
    if (req.body?.id !== req.params.id) {
      throw new HttpError(400, "Engagement id does not match the URL.");
    }
    if (!store.get(req.params.id)) throw new HttpError(404, "Engagement not found.");
    const saved = store.save(parseEngagement(req.body));
    res.json(present(saved));
  });

  app.delete("/api/engagements/:id", (req, res) => {
    if (!store.remove(req.params.id)) throw new HttpError(404, "Engagement not found.");
    res.status(204).end();
  });

  app.post("/api/engagements/:id/suggest-program", (req, res) => {
    const current = mustGet(store, req.params.id);
    const saved = store.save(parseEngagement({ ...current, program: addMappedControls(current) }));
    res.json(present(saved));
  });

  app.post("/api/engagements/:id/generate-requests", (req, res) => {
    const current = mustGet(store, req.params.id);
    const saved = store.save(parseEngagement({ ...current, evidence: generateRequests(current) }));
    res.json(present(saved));
  });

  app.put("/api/engagements/:id/tests/:controlId", (req, res) => {
    const current = mustGet(store, req.params.id);
    const included = current.program.some((item) => item.controlId === req.params.controlId && item.included);
    if (!included) throw new HttpError(400, "Add the control to the program before testing it.");
    const input = parseBody(testInputSchema, req.body);
    let record;
    try {
      record = buildTestRecord(req.params.controlId, input);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "Could not build the test.");
    }
    const saved = store.save(parseEngagement(applyTest(current, record)));
    res.json(present(saved));
  });

  app.post("/api/engagements/:id/findings/draft", (req, res) => {
    const current = mustGet(store, req.params.id);
    const body = parseBody(draftSchema, req.body);
    let finding;
    try {
      finding = draftFinding(current, body.controlId);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "Could not draft the finding.");
    }
    const findings = current.findings.some((item) => item.id === finding.id)
      ? current.findings
      : [...current.findings, finding];
    const saved = store.save(parseEngagement({ ...current, findings }));
    res.json({ ...present(saved), findingId: finding.id });
  });

  app.get("/api/engagements/:id/report", (req, res) => {
    const engagement = mustGet(store, req.params.id);
    const summary = summarize(engagement);
    const report = buildReport(engagement, summary);
    res.json({ ...report, fileName: reportFileName(engagement), summary });
  });

  app.get("/api/engagements/:id/report.md", (req, res) => {
    const engagement = mustGet(store, req.params.id);
    const report = buildReport(engagement, summarize(engagement));
    res.setHeader("content-type", "text/markdown; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="${reportFileName(engagement)}"`);
    res.send(report.markdown);
  });

  app.post("/api/sampling/plan", (req, res) => {
    const body = parseBody(samplePlanSchema, req.body);
    res.json(runSample(() => planSample(body)));
  });

  app.post("/api/sampling/evaluate", (req, res) => {
    const body = parseBody(sampleEvaluationSchema, req.body);
    res.json(runSample(() => evaluateSample(body)));
  });

  app.post("/api/sampling/preset", (req, res) => {
    const body = parseBody(presetSchema, req.body);
    res.json(presetForRisk(body.risk));
  });

  const publicDir = resolvePublicDir();
  app.use(express.static(publicDir, { etag: false, maxAge: 0, index: "index.html" }));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: "Request body is not valid JSON." });
      return;
    }
    logger.error("Fieldnote request failed", error);
    res.status(500).json({ error: "Something went wrong while saving the workpaper." });
  });

  return app;
}

function present(engagement: Engagement) {
  return { engagement, summary: summarize(engagement) };
}

function mustGet(store: Store, id: string): Engagement {
  const engagement = store.get(id);
  if (!engagement) throw new HttpError(404, "Engagement not found.");
  return engagement;
}

function runSample<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Sampling input was not usable.");
  }
}

export function resolvePublicDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(here, "public"), path.resolve(here, "../../src/audit/public")];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "index.html"))) return candidate;
  }
  return path.join(here, "public");
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  const port = Number(process.env.FIELDNOTE_PORT || 4173);
  const host = process.env.FIELDNOTE_HOST || "127.0.0.1";
  const store = createFileStore();
  const server = createAuditApp(store).listen(port, host, () => {
    logger.info(`Fieldnote listening on http://${host}:${port}`);
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
