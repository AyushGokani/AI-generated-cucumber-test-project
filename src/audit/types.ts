export const FRAMEWORKS = ["sox-itgc", "soc2", "iso27001", "nist-csf"] as const;
export type Framework = (typeof FRAMEWORKS)[number];

export const RISKS = ["high", "medium", "low"] as const;
export type Risk = (typeof RISKS)[number];

export const NATURES = ["manual", "automated", "it-dependent"] as const;
export type ControlNature = (typeof NATURES)[number];

export const FREQUENCIES = [
  "continuous",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "annual",
  "per-event",
] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const SOX_AREAS = ["access", "change", "operations", "development"] as const;
export type SoxArea = (typeof SOX_AREAS)[number];

export const PROGRAM_STATUSES = ["not-started", "in-progress", "tested", "reviewed"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const EVIDENCE_STATUSES = ["draft", "requested", "received", "insufficient", "waived"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const CONCLUSIONS = ["not-tested", "effective", "exception", "ineffective"] as const;
export type Conclusion = (typeof CONCLUSIONS)[number];

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const FINDING_STATUSES = ["draft", "issued", "responded", "closed"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const ENGAGEMENT_STATUSES = ["planning", "fieldwork", "reporting", "closed"] as const;
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];

export interface CatalogControl {
  id: string;
  domain: string;
  title: string;
  objective: string;
  /** What can go wrong if the control fails. */
  risk: string;
  sox: SoxArea | null;
  soc2: string[];
  iso: string[];
  nist: string[];
  steps: string[];
  evidence: string[];
  frequency: Frequency;
  nature: ControlNature;
  keyControl: boolean;
}

export interface SystemInScope {
  id: string;
  name: string;
  owner: string;
  criticality: Risk;
  description: string;
}

export interface ProgramItem {
  controlId: string;
  included: boolean;
  inherentRisk: Risk;
  rationale: string;
  tester: string;
  reviewer: string;
  status: ProgramStatus;
}

export interface EvidenceRequest {
  id: string;
  controlId: string;
  description: string;
  owner: string;
  dueDate: string;
  status: EvidenceStatus;
  receivedDate: string;
  notes: string;
}

export interface TestRecord {
  controlId: string;
  designConclusion: Conclusion;
  designNotes: string;
  operatingConclusion: Conclusion;
  operatingNotes: string;
  populationSize: number | null;
  populationDescription: string;
  confidence: number | null;
  tolerableRate: number | null;
  expectedDeviations: number | null;
  sampleSize: number | null;
  reliabilityFactor: number | null;
  upperDeviationRate: number | null;
  statisticalSupport: boolean | null;
  fullPopulation: boolean;
  exceptionsFound: number;
  exceptionNotes: string;
  preparer: string;
  preparedDate: string;
  reviewerSignoff: string;
  reviewedDate: string;
}

export interface Finding {
  id: string;
  controlId: string;
  title: string;
  severity: Severity;
  condition: string;
  criteria: string;
  cause: string;
  effect: string;
  recommendation: string;
  managementResponse: string;
  owner: string;
  targetDate: string;
  status: FindingStatus;
}

export interface Engagement {
  id: string;
  name: string;
  client: string;
  periodStart: string;
  periodEnd: string;
  status: EngagementStatus;
  frameworks: Framework[];
  objective: string;
  scopeIn: string[];
  scopeOut: string[];
  systems: SystemInScope[];
  program: ProgramItem[];
  evidence: EvidenceRequest[];
  tests: TestRecord[];
  findings: Finding[];
  createdAt: string;
  updatedAt: string;
}

export interface DomainProgress {
  domain: string;
  included: number;
  tested: number;
  reviewed: number;
}

export interface EngagementSummary {
  engagementId: string;
  asOf: string;
  included: number;
  tested: number;
  reviewed: number;
  openFindings: number;
  findingsBySeverity: Record<Severity, number>;
  evidenceOutstanding: number;
  evidenceOverdue: number;
  domains: DomainProgress[];
  nextActions: string[];
}
