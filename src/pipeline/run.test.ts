import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractText, mapIssue, mockIssue } from "../jira/client.js";
import { generateFromIssue } from "../generator/cucumber.js";
import { branchNameFor, buildPrBody } from "../git/pr.js";

describe("extractText", () => {
  it("returns plain strings", () => {
    assert.equal(extractText("hello"), "hello");
  });

  it("flattens ADF documents", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello" }, { type: "text", text: " world" }],
        },
      ],
    };
    assert.equal(extractText(adf), "Hello world");
  });
});

describe("mapIssue", () => {
  it("maps Jira REST payload", () => {
    const issue = mapIssue({
      id: "1",
      key: "PROJ-9",
      fields: {
        summary: "Checkout flow",
        description: "Buy stuff",
        status: { name: "Ready for Automation" },
        issuetype: { name: "Story" },
        labels: ["cucumber-auto"],
        priority: { name: "High" },
      },
    });
    assert.equal(issue.key, "PROJ-9");
    assert.equal(issue.summary, "Checkout flow");
    assert.equal(issue.status, "Ready for Automation");
    assert.deepEqual(issue.labels, ["cucumber-auto"]);
  });
});

describe("mock generator", () => {
  it("produces feature + steps artifacts", async () => {
    const issue = mockIssue("DEMO-101");
    const result = await generateFromIssue(issue);
    assert.equal(result.issueKey, "DEMO-101");
    assert.ok(result.artifacts.some((a) => a.kind === "feature"));
    assert.ok(result.artifacts.some((a) => a.kind === "steps"));
    assert.ok(result.artifacts[0].content.includes("Feature:"));
    assert.ok(result.tags.includes("@jira-DEMO-101"));
  });
});

describe("pr helpers", () => {
  it("builds branch names", () => {
    assert.equal(branchNameFor("PROJ-12"), "auto/cucumber-proj-12");
  });

  it("builds PR body with review callout", async () => {
    const issue = mockIssue("DEMO-101");
    const result = await generateFromIssue(issue);
    const body = buildPrBody(result, result.artifacts);
    assert.match(body, /Developer action required/i);
    assert.match(body, /DEMO-101/);
  });
});
