import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { CONTROL_CATALOG } from "./catalog.js";
import { ISO_LABELS, NIST_LABELS, SOC2_LABELS, SOX_LABELS } from "./references.js";
import { buildReport } from "./report.js";
import { evaluateSample, planSample, presetForRisk, reliabilityFactor } from "./sampling.js";
import { buildSampleEngagement } from "./seed.js";
import { createAuditApp } from "./server.js";
import { createFileStore, createMemoryStore } from "./store.js";
import { addMappedControls, applyTest, buildTestRecord, draftFinding, generateRequests, summarize } from "./workpapers.js";

describe("attribute sampling", () => {
  it("uses the zero-deviation Poisson factor -ln(1 - confidence)", () => {
    assert.ok(Math.abs(reliabilityFactor(0, 0.95) - 2.99573227355) < 1e-6);
    assert.ok(Math.abs(reliabilityFactor(0, 0.9) - 2.30258509299) < 1e-6);
    assert.ok(Math.abs(reliabilityFactor(1, 0.95) - 4.743864518) < 1e-3);
  });

  it("sizes a sample and applies the finite-population correction", () => {
    const wide = planSample({ populationSize: 100000, confidence: 0.95, tolerableRate: 0.05, expectedDeviations: 0 });
    assert.equal(wide.unadjustedSampleSize, 60);
    assert.equal(wide.sampleSize, 60);
    assert.equal(wide.fullPopulation, false);

    const terminations = planSample({ populationSize: 142, confidence: 0.95, tolerableRate: 0.05, expectedDeviations: 0 });
    assert.equal(terminations.sampleSize, 43);
    assert.equal(terminations.finitePopulationAdjusted, true);
    assert.match(terminations.narrative, /Test 43 of 142/);
  });

  it("evaluates exceptions against the tolerable rate", () => {
    const failed = evaluateSample({
      populationSize: 142,
      sampleSize: 43,
      exceptionsFound: 3,
      confidence: 0.95,
      tolerableRate: 0.05,
    });
    assert.equal(failed.statisticalSupport, false);
    assert.ok(failed.upperDeviationRate > 0.05);

    const clean = evaluateSample({
      populationSize: 100000,
      sampleSize: 60,
      exceptionsFound: 0,
      confidence: 0.95,
      tolerableRate: 0.05,
    });
    assert.equal(clean.statisticalSupport, true);

    const census = evaluateSample({
      populationSize: 8,
      sampleSize: 8,
      exceptionsFound: 2,
      confidence: 0.95,
      tolerableRate: 0.05,
    });
    assert.equal(census.fullPopulation, true);
    assert.equal(census.statisticalSupport, false);
    assert.ok(Math.abs(census.upperDeviationRate - 0.25) < 1e-9);
  });

  it("rejects a sample larger than the population", () => {
    assert.throws(
      () => evaluateSample({ populationSize: 10, sampleSize: 11, exceptionsFound: 0, confidence: 0.9, tolerableRate: 0.1 }),
      /cannot be larger/,
    );
  });

  it("offers tighter parameters for high inherent risk", () => {
    const preset = presetForRisk("high");
    assert.equal(preset.confidence, 0.95);
    assert.equal(preset.tolerableRate, 0.05);
  });
});

describe("catalog and sample engagement", () => {
  it("cites only references the workbench can explain", () => {
    const ids = new Set(CONTROL_CATALOG.map((control) => control.id));
    assert.equal(ids.size, CONTROL_CATALOG.length);
    for (const control of CONTROL_CATALOG) {
      if (control.sox) assert.ok(SOX_LABELS[control.sox]);
      for (const id of control.soc2) assert.ok(SOC2_LABELS[id], id);
      for (const id of control.iso) assert.ok(ISO_LABELS[id], id);
      for (const id of control.nist) assert.ok(NIST_LABELS[id], id);
    }
  });

  it("summarizes the Northwind fieldwork as of 12 Oct 2026", () => {
    const engagement = buildSampleEngagement();
    const summary = summarize(engagement, CONTROL_CATALOG, "2026-10-12");
    assert.equal(summary.included, 14);
    assert.equal(summary.tested, 5);
    assert.equal(summary.reviewed, 3);
    assert.equal(summary.openFindings, 2);
    assert.equal(summary.findingsBySeverity.high, 1);
    assert.equal(summary.evidenceOutstanding, 4);
    assert.equal(summary.evidenceOverdue, 2);
    assert.ok(summary.nextActions.some((action) => action.includes("AC-04")));
    assert.ok(summary.nextActions.some((action) => action.includes("still a draft")));
    assert.equal(engagement.tests.find((test) => test.controlId === "AC-02")?.sampleSize, 43);
  });

  it("keeps removed controls removed when adding mapped controls", () => {
    const engagement = buildSampleEngagement();
    const removed = engagement.program.find((item) => item.controlId === "AC-06");
    assert.ok(removed);
    removed.included = false;
    const next = addMappedControls(engagement);
    assert.equal(next.filter((item) => item.controlId === "AC-06").length, 1);
    assert.equal(next.find((item) => item.controlId === "AC-06")?.included, false);
    assert.ok(next.length > engagement.program.length);
  });

  it("adds evidence requests only for included controls that lack one", () => {
    const engagement = buildSampleEngagement();
    const before = engagement.evidence.length;
    const next = generateRequests(engagement);
    const added = next.slice(before).map((request) => request.controlId).sort();
    assert.deepEqual(added, ["AC-05", "AC-06", "CHG-03", "RES-01"]);
    assert.equal(generateRequests({ ...engagement, evidence: next }).length, next.length);
  });

  it("reuses an open finding and marks a reviewed test", () => {
    const engagement = buildSampleEngagement();
    const existing = draftFinding(engagement, "AC-02");
    assert.equal(existing.id, "find-ac02");

    const record = buildTestRecord("AC-04", {
      designConclusion: "effective",
      designNotes: "Administrators are named.",
      operatingConclusion: "effective",
      operatingNotes: "Listing agreed to approvals.",
      populationSize: 12,
      populationDescription: "Standing administrators",
      confidence: 0.95,
      tolerableRate: 0.05,
      expectedDeviations: 0,
      exceptionsFound: 0,
      exceptionNotes: "",
      preparer: "A. Shah",
      preparedDate: "2026-10-11",
      reviewerSignoff: "M. Okonkwo",
      reviewedDate: "2026-10-12",
    });
    const updated = applyTest(engagement, record);
    assert.equal(updated.program.find((item) => item.controlId === "AC-04")?.status, "reviewed");
  });

  it("writes a workpaper that states what it is", () => {
    const engagement = buildSampleEngagement();
    const report = buildReport(engagement, summarize(engagement, CONTROL_CATALOG, "2026-10-12"));
    assert.match(report.markdown, /Northwind Retail Group/);
    assert.match(report.markdown, /Terminated users kept SAP access/);
    assert.match(report.markdown, /not an assurance report/);
    assert.match(report.html, /<h1>IT audit workpaper summary<\/h1>/);
    assert.doesNotMatch(report.html, /<script/);
  });
});

describe("fieldnote http", () => {
  const store = createMemoryStore([buildSampleEngagement()]);
  const server = createAuditApp(store).listen(0, "127.0.0.1");
  let base = "";

  before(async () => {
    if (!server.listening) {
      await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    }
    const port = (server.address() as AddressInfo).port;
    base = `http://127.0.0.1:${port}`;
  });

  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("serves the workbench and the catalog", async () => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Fieldnote/);
    const catalog = (await (await fetch(`${base}/api/catalog`)).json()) as { controls: { id: string }[] };
    assert.ok(catalog.controls.some((control) => control.id === "AC-02"));
  });

  it("returns the Northwind summary and report", async () => {
    const detail = (await (await fetch(`${base}/api/engagements/eng-northwind`)).json()) as {
      summary: { evidenceOverdue: number };
    };
    assert.equal(detail.summary.evidenceOverdue, 2);
    const report = (await (await fetch(`${base}/api/engagements/eng-northwind/report`)).json()) as { markdown: string };
    assert.match(report.markdown, /Two emergency changes missed retrospective approval/);
  });

  it("creates an engagement, adds controls, and rejects a bad sample", async () => {
    const created = await fetch(`${base}/api/engagements`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client: "Contoso",
        name: "Access review",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        frameworks: ["iso27001"],
        objective: "Test access controls.",
      }),
    });
    assert.equal(created.status, 201);
    const { engagement } = (await created.json()) as { engagement: { id: string } };
    const suggested = await fetch(`${base}/api/engagements/${engagement.id}/suggest-program`, { method: "POST" });
    const program = (await suggested.json()) as { engagement: { program: { controlId: string }[] } };
    assert.ok(program.engagement.program.some((item) => item.controlId === "AC-01"));
    assert.ok(program.engagement.program.length >= 10);

    const bad = await fetch(`${base}/api/sampling/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ populationSize: 10, confidence: 0.5, tolerableRate: 0.05, expectedDeviations: 0 }),
    });
    assert.equal(bad.status, 400);
  });
});

describe("file store", () => {
  it("writes and reloads engagements", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fieldnote-"));
    try {
      const file = path.join(dir, "fieldnote.json");
      const store = createFileStore(file);
      assert.equal(store.get("eng-northwind")?.client, "Northwind Retail Group");
      const reloaded = createFileStore(file);
      assert.equal(reloaded.list().length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
