import { randomUUID } from "node:crypto";
import { CONTROL_CATALOG } from "./catalog.js";
import { DOMAIN_ORDER, FRAMEWORK_LABELS, SOX_SHORT } from "./references.js";
import { evaluateSample, planSample } from "./sampling.js";
import type {
  CatalogControl,
  Conclusion,
  Engagement,
  EngagementSummary,
  EvidenceRequest,
  Finding,
  Framework,
  ProgramItem,
  Severity,
  TestRecord,
} from "./types.js";

export function newId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export function todayISO(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function matchesFramework(control: CatalogControl, framework: Framework): boolean {
  if (framework === "sox-itgc") return control.sox !== null;
  if (framework === "soc2") return control.soc2.length > 0;
  if (framework === "iso27001") return control.iso.length > 0;
  return control.nist.length > 0;
}

export function blankProgramItem(control: CatalogControl): ProgramItem {
  return {
    controlId: control.id,
    included: true,
    inherentRisk: control.keyControl ? "high" : "medium",
    rationale: "",
    tester: "",
    reviewer: "",
    status: "not-started",
  };
}

export function addMappedControls(engagement: Engagement, catalog = CONTROL_CATALOG): ProgramItem[] {
  const present = new Set(engagement.program.map((item) => item.controlId));
  const additions: ProgramItem[] = [];
  for (const control of catalog) {
    if (present.has(control.id)) continue;
    if (!engagement.frameworks.some((framework) => matchesFramework(control, framework))) continue;
    additions.push(blankProgramItem(control));
  }
  return [...engagement.program, ...additions];
}

export function includedItems(engagement: Engagement): ProgramItem[] {
  return engagement.program.filter((item) => item.included);
}

export function isOperatingTested(test: TestRecord | undefined): boolean {
  if (!test) return false;
  if (test.designConclusion === "ineffective") return true;
  return test.operatingConclusion !== "not-tested";
}

export function testFor(engagement: Engagement, controlId: string): TestRecord | undefined {
  return engagement.tests.find((test) => test.controlId === controlId);
}

const OUTSTANDING = new Set(["draft", "requested", "insufficient"]);

export function evidenceOutstanding(request: EvidenceRequest): boolean {
  return OUTSTANDING.has(request.status);
}

export function evidenceOverdue(request: EvidenceRequest, asOf: string): boolean {
  return evidenceOutstanding(request) && request.dueDate !== "" && request.dueDate < asOf;
}

export interface TestInput {
  designConclusion: Conclusion;
  designNotes: string;
  operatingConclusion: Conclusion;
  operatingNotes: string;
  populationSize: number | null;
  populationDescription: string;
  confidence: number | null;
  tolerableRate: number | null;
  expectedDeviations: number | null;
  exceptionsFound: number;
  exceptionNotes: string;
  preparer: string;
  preparedDate: string;
  reviewerSignoff: string;
  reviewedDate: string;
}

export function blankTest(controlId: string): TestRecord {
  return {
    controlId,
    designConclusion: "not-tested",
    designNotes: "",
    operatingConclusion: "not-tested",
    operatingNotes: "",
    populationSize: null,
    populationDescription: "",
    confidence: null,
    tolerableRate: null,
    expectedDeviations: null,
    sampleSize: null,
    reliabilityFactor: null,
    upperDeviationRate: null,
    statisticalSupport: null,
    fullPopulation: false,
    exceptionsFound: 0,
    exceptionNotes: "",
    preparer: "",
    preparedDate: "",
    reviewerSignoff: "",
    reviewedDate: "",
  };
}

export function buildTestRecord(controlId: string, input: TestInput): TestRecord {
  const record = blankTest(controlId);
  record.designConclusion = input.designConclusion;
  record.designNotes = input.designNotes.trim();
  record.operatingConclusion = input.operatingConclusion;
  record.operatingNotes = input.operatingNotes.trim();
  record.populationDescription = input.populationDescription.trim();
  record.exceptionsFound = input.exceptionsFound;
  record.exceptionNotes = input.exceptionNotes.trim();
  record.preparer = input.preparer.trim();
  record.preparedDate = input.preparedDate;
  record.reviewerSignoff = input.reviewerSignoff.trim();
  record.reviewedDate = input.reviewedDate;

  const hasPopulation = input.populationSize !== null && input.populationSize !== undefined;
  if (!hasPopulation) {
    if (input.exceptionsFound > 0) {
      throw new Error("Record the population size before recording exceptions.");
    }
    return record;
  }

  if (input.confidence === null || input.tolerableRate === null || input.expectedDeviations === null) {
    throw new Error("Confidence, tolerable rate, and expected deviations are required once a population is entered.");
  }

  const plan = planSample({
    populationSize: input.populationSize as number,
    confidence: input.confidence,
    tolerableRate: input.tolerableRate,
    expectedDeviations: input.expectedDeviations,
  });
  const evaluation = evaluateSample({
    populationSize: plan.populationSize,
    sampleSize: plan.sampleSize,
    exceptionsFound: input.exceptionsFound,
    confidence: input.confidence,
    tolerableRate: input.tolerableRate,
  });

  record.populationSize = plan.populationSize;
  record.confidence = plan.confidence;
  record.tolerableRate = plan.tolerableRate;
  record.expectedDeviations = plan.expectedDeviations;
  record.sampleSize = plan.sampleSize;
  record.reliabilityFactor = evaluation.reliabilityFactor ?? plan.reliabilityFactor;
  record.upperDeviationRate = evaluation.upperDeviationRate;
  record.statisticalSupport = evaluation.statisticalSupport;
  record.fullPopulation = evaluation.fullPopulation;
  return record;
}

export function applyTest(engagement: Engagement, record: TestRecord): Engagement {
  const program = engagement.program.map((item) => {
    if (item.controlId !== record.controlId) return item;
    const next = { ...item };
    if (next.status === "not-started" && (record.designNotes || record.operatingNotes || record.designConclusion !== "not-tested")) {
      next.status = "in-progress";
    }
    if (isOperatingTested(record) && next.status !== "reviewed") {
      next.status = "tested";
    }
    if (record.reviewerSignoff && record.reviewedDate && isOperatingTested(record)) {
      next.status = "reviewed";
    }
    if (!next.tester && record.preparer) next.tester = record.preparer;
    if (!next.reviewer && record.reviewerSignoff) next.reviewer = record.reviewerSignoff;
    return next;
  });
  const tests = engagement.tests.some((test) => test.controlId === record.controlId)
    ? engagement.tests.map((test) => (test.controlId === record.controlId ? record : test))
    : [...engagement.tests, record];
  return { ...engagement, program, tests };
}

export function generateRequests(engagement: Engagement, catalog = CONTROL_CATALOG): EvidenceRequest[] {
  const covered = new Set(engagement.evidence.map((request) => request.controlId));
  const additions: EvidenceRequest[] = [];
  for (const item of includedItems(engagement)) {
    if (covered.has(item.controlId)) continue;
    const control = catalog.find((entry) => entry.id === item.controlId);
    if (!control) continue;
    additions.push({
      id: newId("pbc"),
      controlId: control.id,
      description: control.evidence.join("\n"),
      owner: "",
      dueDate: "",
      status: "draft",
      receivedDate: "",
      notes: "",
    });
  }
  return [...engagement.evidence, ...additions];
}

function referenceList(control: CatalogControl): string {
  const parts: string[] = [];
  if (control.sox) parts.push(SOX_SHORT[control.sox]);
  parts.push(...control.soc2.map((id) => `SOC 2 ${id}`));
  parts.push(...control.iso.map((id) => `ISO ${id}`));
  parts.push(...control.nist.map((id) => `NIST ${id}`));
  return parts.join(", ");
}

export function draftFinding(engagement: Engagement, controlId: string, catalog = CONTROL_CATALOG): Finding {
  const control = catalog.find((entry) => entry.id === controlId);
  if (!control) throw new Error(`Unknown control ${controlId}.`);
  const existing = engagement.findings.find((finding) => finding.controlId === controlId && finding.status !== "closed");
  if (existing) return existing;
  const test = testFor(engagement, controlId);
  const failedDesign = test?.designConclusion === "ineffective";
  const ineffective = test?.operatingConclusion === "ineffective" || failedDesign;
  const exception = test?.operatingConclusion === "exception";
  let severity: Severity = "medium";
  if (control.keyControl && ineffective) severity = "high";
  else if (!control.keyControl && exception && !ineffective) severity = "low";

  const condition =
    test?.exceptionNotes.trim() ||
    test?.operatingNotes.trim() ||
    test?.designNotes.trim() ||
    "Testing identified a deviation. Replace this sentence with the population, the sample, and what failed.";

  return {
    id: newId("find"),
    controlId,
    title: control.title,
    severity,
    condition,
    criteria: `${control.objective} (${control.id}; ${referenceList(control)}).`,
    cause: "Cause is not established yet. Confirm with the control owner whether this is a design gap, an operating lapse, or a bad population.",
    effect: control.risk,
    recommendation: `Correct ${control.id}, keep evidence that the corrected control operated, and offer it for retest over a long enough window to show it is working.`,
    managementResponse: "",
    owner: "",
    targetDate: "",
    status: "draft",
  };
}

function prettyDate(iso: string): string {
  if (!iso) return "no due date";
  const [year, month, day] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}

export function summarize(
  engagement: Engagement,
  catalog = CONTROL_CATALOG,
  asOf = todayISO(),
): EngagementSummary {
  const included = includedItems(engagement);
  const tested = included.filter((item) => isOperatingTested(testFor(engagement, item.controlId))).length;
  const reviewed = included.filter((item) => item.status === "reviewed").length;
  const openFindings = engagement.findings.filter((finding) => finding.status !== "closed");
  const findingsBySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of openFindings) findingsBySeverity[finding.severity] += 1;

  const outstanding = engagement.evidence.filter((request) => evidenceOutstanding(request));
  const overdue = outstanding.filter((request) => evidenceOverdue(request, asOf));

  const byId = new Map(catalog.map((control) => [control.id, control]));
  const domains = DOMAIN_ORDER.map((domain) => {
    const items = included.filter((item) => byId.get(item.controlId)?.domain === domain);
    return {
      domain,
      included: items.length,
      tested: items.filter((item) => isOperatingTested(testFor(engagement, item.controlId))).length,
      reviewed: items.filter((item) => item.status === "reviewed").length,
    };
  }).filter((domain) => domain.included > 0);

  const nextActions: string[] = [];
  if (included.length === 0) {
    nextActions.push("No controls are in the program yet. Add the controls that map to the selected frameworks.");
  }

  const namedOverdue = overdue.slice(0, 3).map((request) => {
    const control = catalog.find((entry) => entry.id === request.controlId);
    const name = control ? `${control.id} (${control.title})` : request.controlId;
    return `Evidence for ${name} was due ${prettyDate(request.dueDate)} and is still ${request.status}.`;
  });
  nextActions.push(...namedOverdue);
  if (overdue.length > 3) {
    nextActions.push(`${overdue.length - 3} more evidence requests are past due.`);
  }

  const drafts = outstanding.filter((request) => request.status === "draft").length;
  if (drafts > 0) {
    nextActions.push(
      drafts === 1
        ? "1 prepared-by-client request is still a draft and has not been sent."
        : `${drafts} prepared-by-client requests are still drafts and have not been sent.`,
    );
  }

  const untestedKey = included.filter((item) => {
    const control = catalog.find((entry) => entry.id === item.controlId);
    return control?.keyControl && !isOperatingTested(testFor(engagement, item.controlId));
  });
  for (const item of untestedKey.slice(0, 3)) {
    const control = catalog.find((entry) => entry.id === item.controlId);
    nextActions.push(`${item.controlId} (${control?.title ?? "this control"}) is a key control and has no operating-effectiveness conclusion.`);
  }
  if (untestedKey.length > 3) {
    nextActions.push(`${untestedKey.length - 3} other key controls have not been tested.`);
  }

  const waitingReview = included.filter((item) => item.status === "tested").length;
  if (waitingReview > 0) {
    nextActions.push(`${waitingReview} tested ${waitingReview === 1 ? "control is" : "controls are"} waiting for reviewer sign-off.`);
  }

  const needsResponse = openFindings.filter((finding) => !finding.managementResponse.trim() && finding.status !== "draft").length;
  if (needsResponse > 0) {
    nextActions.push(`${needsResponse} ${needsResponse === 1 ? "finding has" : "findings have"} no management response.`);
  }

  const failedWithoutFinding = included.filter((item) => {
    const test = testFor(engagement, item.controlId);
    const failed = test?.operatingConclusion === "ineffective" || test?.operatingConclusion === "exception" || test?.designConclusion === "ineffective";
    if (!failed) return false;
    return !engagement.findings.some((finding) => finding.controlId === item.controlId);
  }).length;
  if (failedWithoutFinding > 0) {
    nextActions.push(`${failedWithoutFinding} ${failedWithoutFinding === 1 ? "test has" : "tests have"} exceptions and no finding.`);
  }

  if (nextActions.length === 0) {
    nextActions.push("Nothing is blocked. Continue fieldwork, or move the engagement to reporting when the review is done.");
  }

  return {
    engagementId: engagement.id,
    asOf,
    included: included.length,
    tested,
    reviewed,
    openFindings: openFindings.length,
    findingsBySeverity,
    evidenceOutstanding: outstanding.length,
    evidenceOverdue: overdue.length,
    domains,
    nextActions,
  };
}

export function frameworkLabel(framework: Framework): string {
  return FRAMEWORK_LABELS[framework].label;
}

export interface BlankEngagementInput {
  client: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  frameworks: Framework[];
  objective?: string;
}

export function createBlankEngagement(input: BlankEngagementInput, now = new Date()): Engagement {
  const client = input.client.trim();
  const name = input.name.trim();
  if (!client) throw new Error("Client is required.");
  if (!name) throw new Error("Engagement name is required.");
  if (input.frameworks.length === 0) throw new Error("Select at least one framework.");
  if (input.periodEnd < input.periodStart) throw new Error("Period end is before period start.");
  const stamp = now.toISOString();
  return {
    id: newId("eng"),
    name,
    client,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    status: "planning",
    frameworks: [...new Set(input.frameworks)],
    objective: (input.objective ?? "").trim(),
    scopeIn: [],
    scopeOut: [],
    systems: [],
    program: [],
    evidence: [],
    tests: [],
    findings: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}
