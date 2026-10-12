import { z } from "zod";
import type { Engagement } from "./types.js";
import {
  CONCLUSIONS,
  ENGAGEMENT_STATUSES,
  EVIDENCE_STATUSES,
  FINDING_STATUSES,
  FRAMEWORKS,
  PROGRAM_STATUSES,
  RISKS,
  SEVERITIES,
} from "./types.js";

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function enumOf<T extends string>(values: readonly T[]) {
  return z.enum(values as unknown as [T, ...T[]]);
}

const dateOrEmpty = z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/);
const dateRequired = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const confidenceValue = z.union([z.literal(0.9), z.literal(0.95), z.literal(0.99)]);

const systemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  owner: z.string(),
  criticality: enumOf(RISKS),
  description: z.string(),
});

const programItemSchema = z.object({
  controlId: z.string().min(1),
  included: z.boolean(),
  inherentRisk: enumOf(RISKS),
  rationale: z.string(),
  tester: z.string(),
  reviewer: z.string(),
  status: enumOf(PROGRAM_STATUSES),
});

const evidenceSchema = z.object({
  id: z.string().min(1),
  controlId: z.string().min(1),
  description: z.string(),
  owner: z.string(),
  dueDate: dateOrEmpty,
  status: enumOf(EVIDENCE_STATUSES),
  receivedDate: dateOrEmpty,
  notes: z.string(),
});

const testSchema = z.object({
  controlId: z.string().min(1),
  designConclusion: enumOf(CONCLUSIONS),
  designNotes: z.string(),
  operatingConclusion: enumOf(CONCLUSIONS),
  operatingNotes: z.string(),
  populationSize: z.number().int().positive().nullable(),
  populationDescription: z.string(),
  confidence: confidenceValue.nullable(),
  tolerableRate: z.number().gt(0).lt(1).nullable(),
  expectedDeviations: z.number().int().min(0).max(10).nullable(),
  sampleSize: z.number().int().positive().nullable(),
  reliabilityFactor: z.number().positive().nullable(),
  upperDeviationRate: z.number().min(0).nullable(),
  statisticalSupport: z.boolean().nullable(),
  fullPopulation: z.boolean(),
  exceptionsFound: z.number().int().min(0),
  exceptionNotes: z.string(),
  preparer: z.string(),
  preparedDate: dateOrEmpty,
  reviewerSignoff: z.string(),
  reviewedDate: dateOrEmpty,
});

const findingSchema = z.object({
  id: z.string().min(1),
  controlId: z.string().min(1),
  title: z.string().min(1),
  severity: enumOf(SEVERITIES),
  condition: z.string(),
  criteria: z.string(),
  cause: z.string(),
  effect: z.string(),
  recommendation: z.string(),
  managementResponse: z.string(),
  owner: z.string(),
  targetDate: dateOrEmpty,
  status: enumOf(FINDING_STATUSES),
});

export const engagementSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    client: z.string().min(1),
    periodStart: dateRequired,
    periodEnd: dateRequired,
    status: enumOf(ENGAGEMENT_STATUSES),
    frameworks: z.array(enumOf(FRAMEWORKS)).min(1),
    objective: z.string(),
    scopeIn: z.array(z.string()),
    scopeOut: z.array(z.string()),
    systems: z.array(systemSchema),
    program: z.array(programItemSchema),
    evidence: z.array(evidenceSchema),
    tests: z.array(testSchema),
    findings: z.array(findingSchema),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .superRefine((engagement, ctx) => {
    unique(engagement.program.map((item) => item.controlId), "control", "program", ctx);
    unique(engagement.evidence.map((item) => item.id), "evidence id", "evidence", ctx);
    unique(engagement.tests.map((item) => item.controlId), "test", "tests", ctx);
    unique(engagement.findings.map((item) => item.id), "finding id", "findings", ctx);
    unique(engagement.systems.map((item) => item.id), "system id", "systems", ctx);
  });

function unique(
  values: string[],
  label: string,
  path: string,
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate ${label}: ${value}`, path: [path] });
    }
    seen.add(value);
  }
}

export const createEngagementSchema = z.object({
  client: z.string(),
  name: z.string(),
  periodStart: dateRequired,
  periodEnd: dateRequired,
  frameworks: z.array(enumOf(FRAMEWORKS)).min(1),
  objective: z.string().optional(),
});

export const testInputSchema = z.object({
  designConclusion: enumOf(CONCLUSIONS),
  designNotes: z.string(),
  operatingConclusion: enumOf(CONCLUSIONS),
  operatingNotes: z.string(),
  populationSize: z.number().int().positive().nullable(),
  populationDescription: z.string(),
  confidence: confidenceValue.nullable(),
  tolerableRate: z.number().gt(0).lt(1).nullable(),
  expectedDeviations: z.number().int().min(0).max(10).nullable(),
  exceptionsFound: z.number().int().min(0),
  exceptionNotes: z.string(),
  preparer: z.string(),
  preparedDate: dateOrEmpty,
  reviewerSignoff: z.string(),
  reviewedDate: dateOrEmpty,
});

export const samplePlanSchema = z.object({
  populationSize: z.number(),
  confidence: z.number(),
  tolerableRate: z.number(),
  expectedDeviations: z.number(),
});

export const sampleEvaluationSchema = samplePlanSchema.extend({
  sampleSize: z.number(),
  exceptionsFound: z.number(),
});

export const presetSchema = z.object({ risk: enumOf(RISKS) });
export const draftSchema = z.object({ controlId: z.string().min(1) });

export function parseEngagement(input: unknown): Engagement {
  const parsed = engagementSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(400, issues(parsed.error));
  }
  if (parsed.data.periodEnd < parsed.data.periodStart) {
    throw new HttpError(400, "Period end is before period start.");
  }
  return parsed.data;
}

export function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, issues(parsed.error));
  return parsed.data;
}

function issues(error: z.ZodError): string {
  return error.issues
    .slice(0, 6)
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}
