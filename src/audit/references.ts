import type { Framework, SoxArea } from "./types.js";

export const FRAMEWORK_LABELS: Record<Framework, { label: string; short: string }> = {
  "sox-itgc": { label: "SOX IT general controls", short: "SOX" },
  soc2: { label: "SOC 2 trust services criteria", short: "SOC 2" },
  iso27001: { label: "ISO/IEC 27001:2022 Annex A", short: "ISO" },
  "nist-csf": { label: "NIST CSF 2.0", short: "NIST" },
};

export const SOX_LABELS: Record<SoxArea, string> = {
  access: "SOX ITGC — access to programs and data",
  change: "SOX ITGC — program change",
  operations: "SOX ITGC — computer operations",
  development: "SOX ITGC — program development",
};

export const SOX_SHORT: Record<SoxArea, string> = {
  access: "SOX access",
  change: "SOX change",
  operations: "SOX operations",
  development: "SOX development",
};

/** Short working labels for criteria cited by the catalog. Not the full criterion text. */
export const SOC2_LABELS: Record<string, string> = {
  "CC1.4": "Competent people, including security awareness",
  "CC6.1": "Logical access safeguards",
  "CC6.2": "Users are registered and authorized before access is issued",
  "CC6.3": "Access is granted, changed, and removed on least privilege and segregation of duties",
  "CC6.6": "Protection at the system boundary",
  "CC6.7": "Transmission and removal of information is restricted",
  "CC6.8": "Unauthorized or malicious software is prevented or detected",
  "CC7.1": "New vulnerabilities and unsafe configuration changes are detected",
  "CC7.2": "System components are monitored for anomalies",
  "CC7.3": "Security events are evaluated and acted on",
  "CC7.4": "Incidents are handled through a defined response program",
  "CC8.1": "Changes are authorized, tested, approved, and implemented",
  "CC9.2": "Vendor and business-partner risk is assessed and managed",
  "A1.2": "Backup and recovery infrastructure is operated and monitored",
  "A1.3": "Recovery procedures are tested",
  "C1.1": "Confidential information is identified and maintained",
};

/** ISO/IEC 27001:2022 Annex A control titles. */
export const ISO_LABELS: Record<string, string> = {
  "A.5.9": "Inventory of information and other associated assets",
  "A.5.15": "Access control",
  "A.5.16": "Identity management",
  "A.5.17": "Authentication information",
  "A.5.18": "Access rights",
  "A.5.19": "Information security in supplier relationships",
  "A.5.22": "Monitoring, review and change management of supplier services",
  "A.5.24": "Information security incident management planning and preparation",
  "A.5.25": "Assessment and decision on information security events",
  "A.5.26": "Response to information security incidents",
  "A.5.29": "Information security during disruption",
  "A.5.30": "ICT readiness for business continuity",
  "A.6.3": "Information security awareness, education and training",
  "A.8.2": "Privileged access rights",
  "A.8.5": "Secure authentication",
  "A.8.7": "Protection against malware",
  "A.8.8": "Management of technical vulnerabilities",
  "A.8.13": "Information backup",
  "A.8.15": "Logging",
  "A.8.16": "Monitoring activities",
  "A.8.20": "Networks security",
  "A.8.24": "Use of cryptography",
  "A.8.31": "Separation of development, test and production environments",
  "A.8.32": "Change management",
};

/** NIST CSF 2.0 subcategory outcomes cited by the catalog. */
export const NIST_LABELS: Record<string, string> = {
  "ID.AM-01": "Inventories of hardware managed by the organization are maintained",
  "ID.AM-02": "Inventories of software, services, and systems managed by the organization are maintained",
  "PR.AA-01": "Identities and credentials for authorized users, services, and hardware are managed by the organization",
  "PR.AA-03": "Users, services, and hardware are authenticated",
  "PR.AA-05":
    "Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed, and incorporate the principles of least privilege and separation of duties",
  "PR.AT-01":
    "Personnel are provided with awareness and training so that they possess the knowledge and skills to perform general tasks with cybersecurity risks in mind",
  "PR.DS-01": "The confidentiality, integrity, and availability of data-at-rest are protected",
  "PR.DS-02": "The confidentiality, integrity, and availability of data-in-transit are protected",
  "PR.DS-11": "Backups of data are created, protected, maintained, and tested",
  "PR.PS-01": "Configuration management practices are established and applied",
  "PR.PS-02": "Software is maintained, replaced, and removed commensurate with risk",
  "PR.PS-04": "Log records are generated and made available for continuous monitoring",
  "PR.PS-05": "Installation and execution of unauthorized software are prevented",
  "PR.PS-06":
    "Secure software development practices are integrated, and their performance is monitored throughout the software development life cycle",
  "PR.IR-01": "Networks and environments are protected from unauthorized logical access and usage",
  "PR.IR-03": "Mechanisms are implemented to achieve resilience requirements in normal and adverse situations",
  "DE.CM-01": "Networks and network services are monitored to find potentially adverse events",
  "DE.CM-09":
    "Computing hardware and software, runtime environments, and their data are monitored to find potentially adverse events",
  "DE.AE-02": "Potentially adverse events are analyzed to better understand associated activities",
  "DE.AE-08": "Incidents are declared when adverse events meet the defined incident criteria",
  "RS.MA-01": "The incident response plan is executed in coordination with relevant third parties once an incident is declared",
  "RC.RP-01":
    "The recovery portion of the incident response plan is executed once initiated from the incident response process",
  "GV.SC-04": "Suppliers are known and prioritized by criticality",
  "GV.SC-06": "Planning and due diligence are performed to reduce risks before entering into formal supplier or other third-party relationships",
  "GV.SC-07":
    "The risks posed by a supplier, their products and services, and other third parties are understood, recorded, prioritized, assessed, responded to, and monitored over the course of the relationship",
};

export const DOMAIN_ORDER = [
  "Access",
  "Change",
  "Operations",
  "Security",
  "Resilience",
  "Vendors",
  "Governance",
] as const;
