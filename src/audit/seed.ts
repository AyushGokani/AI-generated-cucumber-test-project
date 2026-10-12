import type { Engagement, EvidenceRequest, ProgramItem, TestRecord } from "./types.js";
import { blankTest, buildTestRecord } from "./workpapers.js";

const STAMP = "2026-09-02T14:00:00.000Z";

function item(
  controlId: string,
  status: ProgramItem["status"],
  tester = "",
  reviewer = "",
  rationale = "",
): ProgramItem {
  return {
    controlId,
    included: true,
    inherentRisk: "high",
    rationale,
    tester,
    reviewer,
    status,
  };
}

function request(
  id: string,
  controlId: string,
  description: string,
  owner: string,
  dueDate: string,
  status: EvidenceRequest["status"],
  notes: string,
  receivedDate = "",
): EvidenceRequest {
  return { id, controlId, description, owner, dueDate, status, receivedDate, notes };
}

export function buildSampleEngagement(): Engagement {
  const accessRemoval = buildTestRecord("AC-02", {
    ...blankInput(),
    designConclusion: "effective",
    designNotes: "The standard requires removal within one business day of the HR effective date. The identity connector is supposed to disable the account and remove application groups the same day.",
    operatingConclusion: "ineffective",
    operatingNotes: "The population of 142 terminations reconciled to the HR report. The connector did not disable SAP for three people during a silent failure in March and April.",
    populationSize: 142,
    populationDescription: "Terminations with an effective date in FY26",
    confidence: 0.95,
    tolerableRate: 0.05,
    expectedDeviations: 0,
    exceptionsFound: 3,
    exceptionNotes: "",
    preparer: "A. Shah",
    preparedDate: "2026-10-02",
  });
  accessRemoval.exceptionNotes = `Of ${accessRemoval.sampleSize} terminations tested, 3 users kept SAP S/4HANA access for 6, 11, and 18 business days after the HR termination date. Policy requires removal within one business day. The three accounts were in the finance posting role.`;

  const newAccess = buildTestRecord("AC-01", {
    ...blankInput(),
    designConclusion: "effective",
    designNotes: "Requests in ServiceNow route to the business owner recorded on the system inventory. The account is not created until that approval is recorded.",
    operatingConclusion: "effective",
    operatingNotes: "86 new accounts reconciled to ServiceNow. No selected account was usable before approval, and none were approved by the requestor.",
    populationSize: 86,
    populationDescription: "Accounts created in Entra ID and SAP during FY26",
    confidence: 0.95,
    tolerableRate: 0.05,
    expectedDeviations: 0,
    exceptionsFound: 0,
    exceptionNotes: "",
    preparer: "A. Shah",
    preparedDate: "2026-09-28",
    reviewerSignoff: "M. Okonkwo",
    reviewedDate: "2026-10-04",
  });

  const normalChange = buildTestRecord("CHG-01", {
    ...blankInput(),
    designConclusion: "effective",
    designNotes: "Normal changes require a business approval, a test note, and a production approval from the change manager, who is not a developer.",
    operatingConclusion: "effective",
    operatingNotes: "310 normal changes reconciled to the deployment log. The sample had all three approvals, and the production approver was not the developer.",
    populationSize: 310,
    populationDescription: "Normal production changes in ServiceNow during FY26, excluding emergencies",
    confidence: 0.95,
    tolerableRate: 0.05,
    expectedDeviations: 0,
    exceptionsFound: 0,
    preparer: "L. Berger",
    preparedDate: "2026-09-30",
    reviewerSignoff: "M. Okonkwo",
    reviewedDate: "2026-10-06",
  });

  const emergency = buildTestRecord("CHG-02", {
    ...blankInput(),
    designConclusion: "effective",
    designNotes: "Emergency changes are a separate ServiceNow path. Policy requires retrospective approval within five business days.",
    operatingConclusion: "exception",
    operatingNotes: "All 8 emergency changes were inspected. Six were approved inside five business days. Two were not.",
    populationSize: 8,
    populationDescription: "Emergency production changes in FY26",
    confidence: 0.95,
    tolerableRate: 0.05,
    expectedDeviations: 0,
    exceptionsFound: 2,
    exceptionNotes: "2 of 8 emergency changes had no retrospective approval within five business days. CHG004418 (12 days) and CHG004455 (9 days). Both were real incidents. The gap is the after-the-fact approval, not the emergency itself.",
    preparer: "L. Berger",
    preparedDate: "2026-10-01",
  });

  const backups = buildTestRecord("OPS-01", {
    ...blankInput(),
    designConclusion: "effective",
    designNotes: "SAP and the integration database are backed up nightly. Policy requires a restore test each quarter.",
    operatingConclusion: "effective",
    operatingNotes: "All four quarterly restore tests were inspected. Each names the system, the date, the result, and the reviewer. Backup-job failures in the year were rerun the same day.",
    populationSize: 4,
    populationDescription: "Quarterly restore tests required by the backup standard",
    confidence: 0.9,
    tolerableRate: 0.1,
    expectedDeviations: 0,
    exceptionsFound: 0,
    preparer: "L. Berger",
    preparedDate: "2026-09-22",
    reviewerSignoff: "M. Okonkwo",
    reviewedDate: "2026-09-26",
  });

  const recertification: TestRecord = {
    ...blankTest("AC-03"),
    designConclusion: "effective",
    designNotes: "Quarterly Entra access reviews are launched by identity operations and completed by the system owner. Rejected access creates a removal ticket.",
    preparer: "A. Shah",
    preparedDate: "2026-10-03",
  };

  const jobs: TestRecord = {
    ...blankTest("OPS-02"),
    designNotes: "Failed jobs page the on-call channel. The March window of the HR-to-Entra connector log was not in the file that was provided.",
    preparer: "L. Berger",
    preparedDate: "2026-10-07",
  };

  return {
    id: "eng-northwind",
    name: "FY26 IT general controls",
    client: "Northwind Retail Group",
    periodStart: "2025-07-01",
    periodEnd: "2026-06-30",
    status: "fieldwork",
    frameworks: ["sox-itgc", "soc2"],
    objective:
      "Test the design and operating effectiveness of IT general controls over the in-scope financial systems, and the related SOC 2 security controls, for the year ended 30 June 2026.",
    scopeIn: [
      "SAP S/4HANA production, for record-to-report and order-to-cash",
      "Workday joiner, mover, and leaver feed",
      "Microsoft Entra ID",
      "AWS production accounts that host the integration layer",
      "ServiceNow change, incident, and access-request tickets for those systems",
    ],
    scopeOut: [
      "Store point-of-sale terminals",
      "Payroll calculation inside Workday",
      "Non-production environments, except where they affect production access or deployment",
      "Physical data-center security, which is covered by the AWS SOC report",
    ],
    systems: [
      {
        id: "sys-sap",
        name: "SAP S/4HANA",
        owner: "Financial systems",
        criticality: "high",
        description: "General ledger, billing, and inventory for the group.",
      },
      {
        id: "sys-workday",
        name: "Workday",
        owner: "People operations",
        criticality: "high",
        description: "System of record for joiners, movers, and leavers.",
      },
      {
        id: "sys-entra",
        name: "Microsoft Entra ID",
        owner: "Identity",
        criticality: "high",
        description: "Workforce authentication, multi-factor authentication, and group assignment.",
      },
      {
        id: "sys-snow",
        name: "ServiceNow",
        owner: "IT service management",
        criticality: "medium",
        description: "Change, incident, and access-request tickets.",
      },
      {
        id: "sys-aws",
        name: "AWS production",
        owner: "Platform",
        criticality: "high",
        description: "Integration services between SAP and the commerce site.",
      },
    ],
    program: [
      item("AC-01", "reviewed", "A. Shah", "M. Okonkwo"),
      item("AC-02", "tested", "A. Shah", "", "Key access control. Terminations were late in the prior year."),
      item("AC-03", "in-progress", "A. Shah"),
      item("AC-04", "not-started"),
      item("AC-05", "not-started"),
      item("AC-06", "not-started"),
      item("CHG-01", "reviewed", "L. Berger", "M. Okonkwo"),
      item("CHG-02", "tested", "L. Berger", "", "Emergency path is the likely way around CHG-01."),
      item("CHG-03", "not-started"),
      item("OPS-01", "reviewed", "L. Berger", "M. Okonkwo"),
      item("OPS-02", "in-progress", "L. Berger"),
      item("SEC-01", "not-started"),
      item("SEC-02", "not-started"),
      item("RES-01", "not-started"),
    ],
    evidence: [
      request(
        "pbc-ac01",
        "AC-01",
        "Population of accounts created in the period\nAccess-request tickets with approver and timestamps",
        "IAM operations",
        "2026-09-12",
        "received",
        "Ticket export plus the approval emails.",
        "2026-09-10",
      ),
      request(
        "pbc-ac02",
        "AC-02",
        "HR termination report\nEntra deprovisioning log\nSAP user listing",
        "IAM operations",
        "2026-09-12",
        "received",
        "Received late. Population reconciled to 142 terminations.",
        "2026-09-18",
      ),
      request(
        "pbc-ac03",
        "AC-03",
        "Quarterly access-review campaigns and the tickets for access that was revoked",
        "System owners",
        "2026-09-30",
        "received",
        "Q1 through Q3 are in. The Q4 campaign is still open, which is expected.",
        "2026-10-01",
      ),
      request(
        "pbc-ac04",
        "AC-04",
        "Privileged-role listings for SAP, Entra ID, and AWS\nApprovals for standing administrators\nA sample of privileged-activity logs",
        "Platform security",
        "2026-09-20",
        "requested",
        "Second request sent 1 Oct. AWS listing is still missing.",
      ),
      request(
        "pbc-chg01",
        "CHG-01",
        "Population of production deployments\nChange tickets with approvals and test evidence",
        "Change manager",
        "2026-09-15",
        "received",
        "Reconciled to 310 normal changes.",
        "2026-09-16",
      ),
      request(
        "pbc-chg02",
        "CHG-02",
        "Emergency-change population and retrospective approvals",
        "Change manager",
        "2026-09-15",
        "received",
        "Eight emergency changes in the year.",
        "2026-09-16",
      ),
      request(
        "pbc-ops01",
        "OPS-01",
        "Backup-job report and the four quarterly restore tests",
        "Platform",
        "2026-09-18",
        "received",
        "Restore tests were complete.",
        "2026-09-19",
      ),
      request(
        "pbc-ops02",
        "OPS-02",
        "Job-failure log for the HR-to-Entra connector and the finance interfaces",
        "Platform",
        "2026-09-25",
        "insufficient",
        "The March window is missing from the connector log. Asked for the monitoring-tool export.",
      ),
      request(
        "pbc-sec01",
        "SEC-01",
        "Scan coverage report and the vulnerability register with discovered and closed dates",
        "Vulnerability management",
        "2026-10-20",
        "requested",
        "First request sent 6 Oct.",
      ),
      request(
        "pbc-sec02",
        "SEC-02",
        "Log-source inventory, retention settings, and a sample of weekly reviews",
        "",
        "",
        "draft",
        "Hold until the log owner is confirmed.",
      ),
    ],
    tests: [newAccess, accessRemoval, recertification, normalChange, emergency, backups, jobs],
    findings: [
      {
        id: "find-ac02",
        controlId: "AC-02",
        title: "Terminated users kept SAP access past the policy window",
        severity: "high",
        condition: `Of ${accessRemoval.sampleSize} terminations tested from a population of 142, 3 users kept SAP S/4HANA access for 6, 11, and 18 business days after their HR termination date. All three were in the finance posting role. Policy requires removal within one business day.`,
        criteria:
          "Access is removed within the policy window when employment ends (AC-02; SOX ITGC access to programs and data; SOC 2 CC6.3; ISO/IEC 27001:2022 A.5.18).",
        cause:
          "The HR-to-identity connector failed silently for the SAP group between 12 March and 2 April 2026, and the daily exception report was not reviewed.",
        effect:
          "Former employees kept the ability to view and post in the general ledger after they left. This raises the risk of unauthorized journal entries and weakens reliance on automated access removal.",
        recommendation:
          "Restore monitoring on the connector, review the exception report each business day, and recertify every termination in the failure window. Offer a later sample of terminations for retest.",
        managementResponse: "",
        owner: "Identity engineering",
        targetDate: "2026-11-15",
        status: "issued",
      },
      {
        id: "find-chg02",
        controlId: "CHG-02",
        title: "Two emergency changes missed retrospective approval",
        severity: "medium",
        condition:
          "All 8 emergency changes in the year were inspected. CHG004418 and CHG004455 had no retrospective approval within the five-business-day window (12 days and 9 days).",
        criteria:
          "Emergency changes are approved retrospectively within the policy window (CHG-02; SOX ITGC program change; SOC 2 CC8.1; ISO/IEC 27001:2022 A.8.32).",
        cause: "The change manager reviews the emergency queue when someone forwards it. There is no scheduled review.",
        effect:
          "The emergency path can be used to leave unapproved changes in production. Both changes were genuine incidents, so the gap is the missing approval rather than an inappropriate emergency.",
        recommendation:
          "Put the emergency queue on a weekly review with a recorded approver, and clear the two open changes.",
        managementResponse:
          "The change manager will review the emergency queue every Monday starting 19 October 2026. The two open changes will be approved or backed out by 30 October 2026.",
        owner: "Change manager",
        targetDate: "2026-10-30",
        status: "responded",
      },
    ],
    createdAt: STAMP,
    updatedAt: "2026-10-08T16:30:00.000Z",
  };
}

function blankInput() {
  return {
    designConclusion: "not-tested" as const,
    designNotes: "",
    operatingConclusion: "not-tested" as const,
    operatingNotes: "",
    populationSize: null,
    populationDescription: "",
    confidence: null,
    tolerableRate: null,
    expectedDeviations: null,
    exceptionsFound: 0,
    exceptionNotes: "",
    preparer: "",
    preparedDate: "",
    reviewerSignoff: "",
    reviewedDate: "",
  };
}
