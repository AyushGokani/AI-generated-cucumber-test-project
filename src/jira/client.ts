import { config } from "../config.js";
import { logger } from "../logger.js";
import type { JiraIssue } from "../types.js";

function authHeader(): string {
  const token = Buffer.from(
    `${config.JIRA_EMAIL}:${config.JIRA_API_TOKEN}`,
  ).toString("base64");
  return `Basic ${token}`;
}

async function jiraFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${config.JIRA_BASE_URL.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader(),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira API ${res.status} ${path}: ${body}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Flatten Atlassian Document Format (ADF) or plain string descriptions. */
export function extractText(description: unknown): string {
  if (!description) return "";
  if (typeof description === "string") return description;
  if (typeof description !== "object") return String(description);

  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (typeof n.text === "string") parts.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(description);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function extractAcceptanceCriteria(
  fields: Record<string, unknown>,
  description: string,
): string {
  // Common custom field names / patterns; fall back to description section.
  for (const [key, value] of Object.entries(fields)) {
    if (/acceptance/i.test(key) && value) {
      const text = extractText(value);
      if (text) return text;
    }
  }

  const match = description.match(
    /acceptance\s*criteria[:\s]*([\s\S]*?)(?:\n\s*\n|$)/i,
  );
  return match?.[1]?.trim() ?? "";
}

export function mapIssue(raw: {
  id: string;
  key: string;
  fields: Record<string, unknown>;
  self?: string;
}): JiraIssue {
  const fields = raw.fields ?? {};
  const summary = String(fields.summary ?? "");
  const description = extractText(fields.description);
  const statusObj = fields.status as { name?: string } | undefined;
  const typeObj = fields.issuetype as { name?: string } | undefined;
  const priorityObj = fields.priority as { name?: string } | undefined;
  const assigneeObj = fields.assignee as { displayName?: string } | undefined;
  const labels = Array.isArray(fields.labels)
    ? (fields.labels as string[])
    : [];

  return {
    key: raw.key,
    id: raw.id,
    summary,
    description,
    acceptanceCriteria: extractAcceptanceCriteria(fields, description),
    issueType: typeObj?.name ?? "Story",
    status: statusObj?.name ?? "Unknown",
    labels,
    priority: priorityObj?.name ?? "Medium",
    assignee: assigneeObj?.displayName,
    url: `${config.JIRA_BASE_URL.replace(/\/$/, "")}/browse/${raw.key}`,
    raw,
  };
}

export async function getIssue(issueKey: string): Promise<JiraIssue> {
  logger.info(`Fetching Jira issue ${issueKey}`);
  const raw = await jiraFetch<{
    id: string;
    key: string;
    fields: Record<string, unknown>;
  }>(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`);
  return mapIssue(raw);
}

export async function searchIssues(jql?: string): Promise<JiraIssue[]> {
  const query = jql ?? config.JIRA_JQL;
  logger.info(`Searching Jira with JQL: ${query}`);
  const data = await jiraFetch<{
    issues: Array<{
      id: string;
      key: string;
      fields: Record<string, unknown>;
    }>;
  }>("/rest/api/3/search/jql", {
    method: "POST",
    body: JSON.stringify({
      jql: query,
      maxResults: 50,
      fields: [
        "summary",
        "description",
        "status",
        "issuetype",
        "labels",
        "priority",
        "assignee",
      ],
    }),
  });

  return (data.issues ?? []).map(mapIssue);
}

export async function addComment(
  issueKey: string,
  body: string,
): Promise<void> {
  logger.info(`Commenting on ${issueKey}`);
  await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
    method: "POST",
    body: JSON.stringify({
      body: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: body }],
          },
        ],
      },
    }),
  });
}

export async function transitionIssue(
  issueKey: string,
  transitionId: string,
): Promise<void> {
  if (!transitionId) return;
  logger.info(`Transitioning ${issueKey} via transition ${transitionId}`);
  await jiraFetch(
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
    {
      method: "POST",
      body: JSON.stringify({ transition: { id: transitionId } }),
    },
  );
}

/** Demo fixture when Jira credentials are absent. */
export function mockIssue(issueKey = "DEMO-101"): JiraIssue {
  return {
    key: issueKey,
    id: "10001",
    summary: "User can log in with valid credentials",
    description:
      "As a registered user I want to log into the application so that I can access my dashboard. " +
      "The login page has email and password fields and a Sign In button. " +
      "Invalid credentials show an error. Successful login redirects to /dashboard.",
    acceptanceCriteria:
      "Given I am on the login page\n" +
      "When I enter a valid email and password and click Sign In\n" +
      "Then I am redirected to the dashboard and see a welcome message\n" +
      "When I enter invalid credentials\n" +
      "Then I see an error message and remain on the login page",
    issueType: "Story",
    status: "Ready for Automation",
    labels: ["cucumber-auto", "e2e"],
    priority: "High",
    assignee: "Automation Bot",
    url: `${config.JIRA_BASE_URL}/browse/${issueKey}`,
    raw: {},
  };
}
