import { config } from "../config.js";
import { logger } from "../logger.js";
import type { GeneratedArtifact, GenerationResult, JiraIssue } from "../types.js";

const SYSTEM_PROMPT = `You are an expert BDD engineer. Given a Jira ticket, generate Cucumber (Gherkin) feature files and Playwright-based TypeScript step definitions.

Rules:
1. Output ONLY valid JSON matching this schema:
{
  "featureName": "kebab-case-name",
  "summary": "one sentence",
  "tags": ["@jira-KEY", "@generated", ...],
  "assumptions": ["list of assumptions you made"],
  "artifacts": [
    { "relativePath": "features/<name>.feature", "kind": "feature", "content": "..." },
    { "relativePath": "steps/<name>.steps.ts", "kind": "steps", "content": "..." }
  ]
}
2. Feature files must be idiomatic Gherkin with Feature, Background (if useful), Scenario/Scenario Outline.
3. Place tags on the line BEFORE the Feature keyword, including @jira-<ISSUE_KEY> and @generated.
4. Feature description (if any) must be plain text lines — never use triple-quote docstrings under Feature.
5. Step definitions use @cucumber/cucumber and Playwright (page from a World).
6. Import { Given, When, Then } from '@cucumber/cucumber'.
7. Import assert from 'node:assert/strict'. NEVER import from '@playwright/test'.
8. Import type { CustomWorld } from '../support/world.js' and type callbacks as async function (this: CustomWorld, ...).
9. Use 'this.page' for Playwright Page (CustomWorld).
10. Prefer resilient selectors (getByRole, getByLabel, getByText).
11. Do not invent product URLs beyond what the ticket implies; use process.env.BASE_URL || 'http://localhost:3000'.
12. Keep steps reusable and focused; avoid hard-coded sleeps.
13. relativePath must be under features/ or steps/ only.`;

function buildUserPrompt(issue: JiraIssue): string {
  return `Generate Cucumber tests for this Jira ticket.

Key: ${issue.key}
Type: ${issue.issueType}
Summary: ${issue.summary}
Priority: ${issue.priority}
Labels: ${issue.labels.join(", ") || "(none)"}
URL: ${issue.url}

Description:
${issue.description || "(empty)"}

Acceptance Criteria:
${issue.acceptanceCriteria || "(not provided — derive from description)"}
`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "generated-feature";
}

function mockGenerate(issue: JiraIssue): GenerationResult {
  const featureName = slugify(issue.summary);
  const tag = `@jira-${issue.key}`;

  const feature = `@jira-${issue.key} @generated @e2e
Feature: ${issue.summary}
  Auto-generated from ${issue.key}
  ${issue.url}

  Background:
    Given the application is reachable

  Scenario: Successful login with valid credentials
    Given I am on the login page
    When I enter email "user@example.com" and password "ValidPass123!"
    And I click the Sign In button
    Then I should be redirected to the dashboard
    And I should see a welcome message

  Scenario: Login fails with invalid credentials
    Given I am on the login page
    When I enter email "user@example.com" and password "wrong-password"
    And I click the Sign In button
    Then I should see a login error message
    And I should remain on the login page
`;

  const steps = `import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { CustomWorld } from "../support/world.js";

const baseUrl = () => process.env.BASE_URL || "http://localhost:3000";

Given("the application is reachable", async function (this: CustomWorld) {
  const res = await this.page.request.get(baseUrl());
  assert.ok(res.ok() || res.status() < 500, \`App not reachable: \${res.status()}\`);
});

Given("I am on the login page", async function (this: CustomWorld) {
  await this.page.goto(\`\${baseUrl()}/login\`);
  await this.page.getByRole("heading", { name: /sign in|log in|login/i }).waitFor({ timeout: 10_000 }).catch(() => {
    // Heading may vary; page load is enough for generated scaffolding.
  });
});

When(
  "I enter email {string} and password {string}",
  async function (this: CustomWorld, email: string, password: string) {
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
  },
);

When("I click the Sign In button", async function (this: CustomWorld) {
  await this.page.getByRole("button", { name: /sign in|log in|login/i }).click();
});

Then("I should be redirected to the dashboard", async function (this: CustomWorld) {
  await this.page.waitForURL(/dashboard/i, { timeout: 15_000 });
});

Then("I should see a welcome message", async function (this: CustomWorld) {
  const welcome = this.page.getByText(/welcome/i);
  await welcome.waitFor({ timeout: 10_000 });
  assert.ok(await welcome.isVisible());
});

Then("I should see a login error message", async function (this: CustomWorld) {
  const error = this.page.getByRole("alert").or(this.page.getByText(/invalid|incorrect|error/i));
  await error.first().waitFor({ timeout: 10_000 });
});

Then("I should remain on the login page", async function (this: CustomWorld) {
  assert.match(this.page.url(), /login/i);
});
`;

  const artifacts: GeneratedArtifact[] = [
    {
      relativePath: `features/${featureName}.feature`,
      kind: "feature",
      content: feature,
    },
    {
      relativePath: `steps/${featureName}.steps.ts`,
      kind: "steps",
      content: steps,
    },
  ];

  return {
    issueKey: issue.key,
    featureName,
    summary: `Generated BDD coverage for: ${issue.summary}`,
    artifacts,
    assumptions: [
      "Login UI uses accessible labels for email/password and a Sign In button.",
      "Successful login navigates to a URL containing 'dashboard'.",
      "BASE_URL defaults to http://localhost:3000.",
      "This is a mock LLM generation for offline/demo mode.",
    ],
    tags: [tag, "@generated", "@e2e"],
  };
}

function parseJsonPayload(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : trimmed;
  return JSON.parse(raw);
}

function validateGeneration(
  issue: JiraIssue,
  data: unknown,
): GenerationResult {
  if (!data || typeof data !== "object") {
    throw new Error("LLM returned non-object JSON");
  }
  const obj = data as Record<string, unknown>;
  const artifactsRaw = obj.artifacts;
  if (!Array.isArray(artifactsRaw) || artifactsRaw.length === 0) {
    throw new Error("LLM response missing artifacts[]");
  }

  const artifacts: GeneratedArtifact[] = artifactsRaw.map((a, i) => {
    const item = a as Record<string, unknown>;
    const relativePath = String(item.relativePath ?? "");
    if (
      !relativePath.startsWith("features/") &&
      !relativePath.startsWith("steps/")
    ) {
      throw new Error(
        `Artifact[${i}] path must start with features/ or steps/: ${relativePath}`,
      );
    }
    return {
      relativePath,
      content: String(item.content ?? ""),
      kind: (item.kind as GeneratedArtifact["kind"]) || "other",
    };
  });

  return {
    issueKey: issue.key,
    featureName: String(obj.featureName || slugify(issue.summary)),
    summary: String(obj.summary || issue.summary),
    artifacts,
    assumptions: Array.isArray(obj.assumptions)
      ? obj.assumptions.map(String)
      : [],
    tags: Array.isArray(obj.tags) ? obj.tags.map(String) : [`@jira-${issue.key}`],
  };
}

async function liveGenerate(issue: JiraIssue): Promise<GenerationResult> {
  logger.info(`Calling LLM (${config.LLM_MODEL}) for ${issue.key}`);
  const res = await fetch(`${config.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.LLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.LLM_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(issue) },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM API ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty content");
  return validateGeneration(issue, parseJsonPayload(content));
}

export async function generateFromIssue(
  issue: JiraIssue,
): Promise<GenerationResult> {
  if (config.LLM_MODE === "mock" || !config.LLM_API_KEY) {
    logger.warn(
      `Using mock generator for ${issue.key} (LLM_MODE=${config.LLM_MODE})`,
    );
    // Tailor mock slightly for non-demo tickets by swapping summary into feature title
    const result = mockGenerate(issue);
    return result;
  }
  return liveGenerate(issue);
}
