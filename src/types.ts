export interface JiraIssue {
  key: string;
  id: string;
  summary: string;
  description: string;
  acceptanceCriteria: string;
  issueType: string;
  status: string;
  labels: string[];
  priority: string;
  assignee?: string;
  url: string;
  raw: unknown;
}

export interface GeneratedArtifact {
  relativePath: string;
  content: string;
  kind: "feature" | "steps" | "support" | "readme" | "other";
}

export interface GenerationResult {
  issueKey: string;
  featureName: string;
  summary: string;
  artifacts: GeneratedArtifact[];
  assumptions: string[];
  tags: string[];
}

export interface PipelineResult {
  issueKey: string;
  success: boolean;
  dryRun: boolean;
  branchName?: string;
  prUrl?: string;
  prNumber?: number;
  artifacts: GeneratedArtifact[];
  assumptions: string[];
  error?: string;
}

export interface PipelineOptions {
  issueKey?: string;
  jql?: string;
  dryRun?: boolean;
  skipPr?: boolean;
  skipJiraUpdate?: boolean;
}
