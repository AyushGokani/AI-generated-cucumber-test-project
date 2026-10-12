import { controlById } from "./catalog.js";
import { FRAMEWORK_LABELS, ISO_LABELS, NIST_LABELS, SOC2_LABELS, SOX_LABELS } from "./references.js";
import { formatConfidence, formatPercent } from "./sampling.js";
import type { Engagement, EngagementSummary, Finding, TestRecord } from "./types.js";
import { includedItems, testFor } from "./workpapers.js";

type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "quote"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "meta"; rows: [string, string][] }
  | { type: "table"; headers: string[]; rows: string[][] };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatLongDate(iso: string): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

function conclusionLabel(value: string): string {
  if (value === "not-tested") return "Not tested";
  if (value === "effective") return "Effective";
  if (value === "exception") return "Exception";
  if (value === "ineffective") return "Ineffective";
  return value;
}

function statusLabel(value: string): string {
  return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sampleCell(test: TestRecord | undefined): string {
  if (!test || test.sampleSize === null || test.populationSize === null) return "—";
  const rate = test.upperDeviationRate === null ? "" : `, upper limit ${formatPercent(test.upperDeviationRate)}`;
  return `${test.sampleSize} of ${test.populationSize}${rate}`;
}

function findingHeading(finding: Finding): string {
  return `${finding.id} · ${statusLabel(finding.severity)} — ${finding.title}`;
}

function blocksFor(engagement: Engagement, summary: EngagementSummary): Block[] {
  const blocks: Block[] = [
    { type: "h1", text: "IT audit workpaper summary" },
    {
      type: "meta",
      rows: [
        ["Client", engagement.client],
        ["Engagement", engagement.name],
        ["Period", `${formatLongDate(engagement.periodStart)} – ${formatLongDate(engagement.periodEnd)}`],
        ["Status", statusLabel(engagement.status)],
        ["Frameworks", engagement.frameworks.map((framework) => FRAMEWORK_LABELS[framework].label).join(", ")],
        ["Prepared", formatLongDate(summary.asOf)],
      ],
    },
    {
      type: "quote",
      text: "This summary is a fieldwork workpaper. It is not an assurance report and it is not a substitute for the detailed tests.",
    },
  ];

  blocks.push({ type: "h2", text: "Objective" });
  blocks.push({
    type: "p",
    text: engagement.objective.trim() || "Objective not recorded.",
  });

  blocks.push({ type: "h2", text: "Scope" });
  blocks.push({ type: "h3", text: "In scope" });
  blocks.push(engagement.scopeIn.length ? { type: "ul", items: engagement.scopeIn } : { type: "p", text: "Nothing recorded." });
  blocks.push({ type: "h3", text: "Out of scope" });
  blocks.push(engagement.scopeOut.length ? { type: "ul", items: engagement.scopeOut } : { type: "p", text: "Nothing recorded." });

  blocks.push({ type: "h2", text: "Systems" });
  if (engagement.systems.length === 0) {
    blocks.push({ type: "p", text: "No systems recorded." });
  } else {
    blocks.push({
      type: "table",
      headers: ["System", "Owner", "Criticality", "Notes"],
      rows: engagement.systems.map((system) => [system.name, system.owner || "—", statusLabel(system.criticality), system.description || "—"]),
    });
  }

  blocks.push({ type: "h2", text: "Progress" });
  blocks.push({
    type: "ul",
    items: [
      `Controls in the program: ${summary.included}`,
      `Operating effectiveness concluded: ${summary.tested}`,
      `Reviewed: ${summary.reviewed}`,
      `Open findings: ${summary.openFindings}`,
      `Evidence still outstanding: ${summary.evidenceOutstanding}`,
      `Evidence past due: ${summary.evidenceOverdue}`,
    ],
  });

  blocks.push({ type: "h2", text: "Test results" });
  const items = includedItems(engagement);
  if (items.length === 0) {
    blocks.push({ type: "p", text: "No controls are in the program." });
  } else {
    blocks.push({
      type: "table",
      headers: ["Control", "Title", "Design", "Operating", "Exceptions", "Sample", "Status"],
      rows: items.map((item) => {
        const control = controlById(item.controlId);
        const test = testFor(engagement, item.controlId);
        return [
          item.controlId,
          control?.title ?? "Control is not in the current library",
          conclusionLabel(test?.designConclusion ?? "not-tested"),
          conclusionLabel(test?.operatingConclusion ?? "not-tested"),
          test ? String(test.exceptionsFound) : "0",
          sampleCell(test),
          statusLabel(item.status),
        ];
      }),
    });
  }

  blocks.push({ type: "h2", text: "Findings" });
  if (engagement.findings.length === 0) {
    blocks.push({ type: "p", text: "No findings recorded." });
  }
  for (const finding of engagement.findings) {
    const control = controlById(finding.controlId);
    blocks.push({ type: "h3", text: findingHeading(finding) });
    blocks.push({
      type: "meta",
      rows: [
        ["Control", control ? `${finding.controlId} — ${control.title}` : finding.controlId],
        ["Status", statusLabel(finding.status)],
        ["Owner", finding.owner || "—"],
        ["Target date", finding.targetDate ? formatLongDate(finding.targetDate) : "—"],
      ],
    });
    blocks.push({ type: "p", text: `Condition. ${finding.condition}` });
    blocks.push({ type: "p", text: `Criteria. ${finding.criteria}` });
    blocks.push({ type: "p", text: `Cause. ${finding.cause}` });
    blocks.push({ type: "p", text: `Effect. ${finding.effect}` });
    blocks.push({ type: "p", text: `Recommendation. ${finding.recommendation}` });
    blocks.push({
      type: "p",
      text: `Management response. ${finding.managementResponse.trim() || "Not received."}`,
    });
  }

  blocks.push({ type: "h2", text: "Evidence requests" });
  if (engagement.evidence.length === 0) {
    blocks.push({ type: "p", text: "No requests recorded." });
  } else {
    blocks.push({
      type: "table",
      headers: ["Control", "Request", "Owner", "Due", "Status"],
      rows: engagement.evidence.map((request) => [
        request.controlId,
        request.description.replace(/\s+/g, " ").trim(),
        request.owner || "—",
        request.dueDate ? formatLongDate(request.dueDate) : "—",
        statusLabel(request.status),
      ]),
    });
  }

  blocks.push({ type: "h2", text: "Open items" });
  blocks.push({ type: "ul", items: summary.nextActions });

  blocks.push({ type: "h2", text: "Method" });
  const sampled = engagement.tests.filter((test) => test.sampleSize !== null);
  const sampleNotes = sampled.map((test) => {
    const confidence = test.confidence === null ? "—" : formatConfidence(test.confidence);
    const tolerable = test.tolerableRate === null ? "—" : formatPercent(test.tolerableRate);
    return `${test.controlId}: sample ${test.sampleSize} of ${test.populationSize}, ${confidence} confidence, tolerable rate ${tolerable}, ${test.exceptionsFound} exceptions.`;
  });
  blocks.push({
    type: "p",
    text:
      "Where a sample is recorded, the size uses a Poisson reliability factor: the confidence quantile of a gamma distribution with shape equal to expected deviations plus one, divided by the tolerable deviation rate, then adjusted for a finite population. Evaluating a result uses the factor for the exceptions actually found. A full population is evaluated on the observed deviation rate. Follow the firm's sampling guide where it differs. Framework citations are crosswalk identifiers so the program can be filtered; confirm them against the current official text before they go into a report that leaves the team.",
  });
  if (sampleNotes.length) blocks.push({ type: "ul", items: sampleNotes });

  const cited = new Set<string>();
  for (const item of items) {
    const control = controlById(item.controlId);
    if (!control) continue;
    if (control.sox) cited.add(`${SOX_LABELS[control.sox]}`);
    for (const id of control.soc2) cited.add(`SOC 2 ${id}: ${SOC2_LABELS[id] ?? id}`);
    for (const id of control.iso) cited.add(`ISO ${id}: ${ISO_LABELS[id] ?? id}`);
    for (const id of control.nist) cited.add(`NIST CSF 2.0 ${id}: ${NIST_LABELS[id] ?? id}`);
  }
  if (cited.size) {
    blocks.push({ type: "h2", text: "References cited in the program" });
    blocks.push({ type: "ul", items: [...cited].sort() });
  }

  return blocks;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

export function renderMarkdown(blocks: Block[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.type === "h1") lines.push(`# ${block.text}`, "");
    else if (block.type === "h2") lines.push(`## ${block.text}`, "");
    else if (block.type === "h3") lines.push(`### ${block.text}`, "");
    else if (block.type === "p") lines.push(block.text, "");
    else if (block.type === "quote") lines.push(`> ${block.text}`, "");
    else if (block.type === "ul") {
      for (const item of block.items) lines.push(`- ${item}`);
      lines.push("");
    } else if (block.type === "meta") {
      for (const [label, value] of block.rows) lines.push(`**${label}:** ${value}  `);
      lines.push("");
    } else if (block.type === "table") {
      lines.push(`| ${block.headers.map(escapeCell).join(" | ")} |`);
      lines.push(`| ${block.headers.map(() => "---").join(" | ")} |`);
      for (const row of block.rows) lines.push(`| ${row.map(escapeCell).join(" | ")} |`);
      lines.push("");
    }
  }
  return lines.join("\n").trim() + "\n";
}

export function renderHtml(blocks: Block[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "h1" || block.type === "h2" || block.type === "h3") {
      parts.push(`<${block.type}>${escapeHtml(block.text)}</${block.type}>`);
    } else if (block.type === "p") {
      const match = block.text.match(/^([A-Z][a-z]+(?: [a-z]+)?)\. ([\s\S]*)$/);
      if (match) {
        parts.push(`<p><strong>${escapeHtml(match[1])}.</strong> ${escapeHtml(match[2])}</p>`);
      } else {
        parts.push(`<p>${escapeHtml(block.text)}</p>`);
      }
    } else if (block.type === "quote") {
      parts.push(`<blockquote>${escapeHtml(block.text)}</blockquote>`);
    } else if (block.type === "ul") {
      parts.push(`<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`);
    } else if (block.type === "meta") {
      parts.push(
        `<dl>${block.rows
          .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
          .join("")}</dl>`,
      );
    } else if (block.type === "table") {
      const head = block.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
      const body = block.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
        .join("");
      parts.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
    }
  }
  return parts.join("\n");
}

export function buildReport(engagement: Engagement, summary: EngagementSummary): { markdown: string; html: string } {
  const blocks = blocksFor(engagement, summary);
  return { markdown: renderMarkdown(blocks), html: renderHtml(blocks) };
}

export function reportFileName(engagement: Engagement): string {
  const slug = `${engagement.client}-${engagement.name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${slug || "fieldnote"}-workpaper.md`;
}
