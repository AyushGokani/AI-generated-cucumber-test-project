const VIEWS = [
  ["desk", "01", "Desk"],
  ["scope", "02", "Scope"],
  ["program", "03", "Program"],
  ["requests", "04", "Requests"],
  ["testing", "05", "Testing"],
  ["findings", "06", "Findings"],
  ["report", "07", "Report"],
];

const VIEW_COPY = {
  desk: "What is blocked, what is tested, and what to pick up next.",
  scope: "The period, the systems, and the frameworks this engagement answers to.",
  program: "Choose the controls to test. The crosswalk lets one test support more than one framework.",
  requests: "The prepared-by-client list: what you asked for, who owns it, and what is late.",
  testing: "Design, sample, and operating effectiveness for one control at a time.",
  findings: "Write the finding the way a reviewer expects: condition, criteria, cause, effect, recommendation.",
  report: "A workpaper summary for the reviewer. It is not an assurance report.",
};

const STATUS_LABEL = {
  "not-started": "Not started",
  "in-progress": "In progress",
  tested: "Tested",
  reviewed: "Reviewed",
  planning: "Planning",
  fieldwork: "Fieldwork",
  reporting: "Reporting",
  closed: "Closed",
  draft: "Draft",
  requested: "Requested",
  received: "Received",
  insufficient: "Insufficient",
  waived: "Waived",
  effective: "Effective",
  exception: "Exception",
  ineffective: "Ineffective",
  "not-tested": "Not tested",
  issued: "Issued",
  responded: "Responded",
  high: "High",
  medium: "Medium",
  low: "Low",
  critical: "Critical",
  overdue: "Past due",
  outstanding: "Outstanding",
  All: "All",
};

const state = {
  catalog: [],
  references: { sox: {}, soc2: {}, iso: {}, nist: {} },
  frameworks: [],
  domains: [],
  engagements: [],
  summary: null,
  currentId: null,
  view: "desk",
  testControlId: null,
  findingId: null,
  programQuery: "",
  programDomain: "all",
  requestFilter: "all",
  notice: "",
  noticeError: false,
  showCreate: false,
  reportHtml: "",
  reportMarkdown: "",
  reportFor: null,
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function label(value) {
  return STATUS_LABEL[value] || value;
}

function prettyDate(iso) {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}

function pill(value, extra = "") {
  return `<span class="pill ${esc(value)} ${extra}">${esc(label(value))}</span>`;
}

function uid(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${hex}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || response.statusText);
  return body;
}

function current() {
  return state.engagements.find((engagement) => engagement.id === state.currentId) || null;
}

function control(id) {
  return state.catalog.find((item) => item.id === id);
}

function included(engagement) {
  return engagement.program.filter((item) => item.included);
}

function testOf(engagement, controlId) {
  return engagement.tests.find((test) => test.controlId === controlId);
}

function replaceEngagement(engagement, summary) {
  const index = state.engagements.findIndex((item) => item.id === engagement.id);
  if (index === -1) state.engagements.push(engagement);
  else state.engagements[index] = engagement;
  state.currentId = engagement.id;
  state.summary = summary;
  localStorage.setItem("fieldnote.engagement", engagement.id);
}

let saveQueue = Promise.resolve();

async function saveEngagement(engagement, { renderAfter = true } = {}) {
  const index = state.engagements.findIndex((item) => item.id === engagement.id);
  if (index >= 0) state.engagements[index] = engagement;
  const run = saveQueue.then(async () => {
    const data = await api(`/api/engagements/${engagement.id}`, { method: "PUT", body: JSON.stringify(engagement) });
    replaceEngagement(data.engagement, data.summary);
    if (renderAfter) render();
    return data;
  });
  saveQueue = run.then(() => undefined, () => undefined);
  return run;
}

function flash(text, isError = false) {
  state.notice = text;
  state.noticeError = isError;
  const node = document.getElementById("notice");
  if (!node) return;
  node.textContent = text;
  node.classList.toggle("error", isError);
}

function readHash() {
  const [view, arg] = (location.hash.replace(/^#/, "") || "desk").split("/");
  if (VIEWS.some(([id]) => id === view)) state.view = view;
  if (view === "testing" && arg) state.testControlId = decodeURIComponent(arg);
  if (view === "findings" && arg) state.findingId = decodeURIComponent(arg);
}

function go(view, arg) {
  const next = arg ? `${view}/${encodeURIComponent(arg)}` : view;
  if (location.hash === `#${next}`) {
    readHash();
    render();
    return;
  }
  location.hash = next;
}

function chips(item) {
  const bits = [];
  if (item.sox && state.references.sox[item.sox]) {
    bits.push([state.references.sox[item.sox].short, state.references.sox[item.sox].label]);
  }
  for (const id of item.soc2) bits.push([id, `SOC 2 ${id}: ${state.references.soc2[id] || ""}`]);
  for (const id of item.iso) bits.push([id, `ISO ${id}: ${state.references.iso[id] || ""}`]);
  for (const id of item.nist) bits.push([id, `NIST ${id}: ${state.references.nist[id] || ""}`]);
  return `<span class="chips">${bits.map(([short, title]) => `<span class="chip" title="${esc(title)}">${esc(short)}</span>`).join("")}</span>`;
}

function shell(engagement) {
  const summary = state.summary;
  const nav = VIEWS.map(([id, number, name]) => {
    let badge = "";
    if (summary && id === "requests" && summary.evidenceOutstanding) badge = `<em>${summary.evidenceOutstanding}</em>`;
    if (summary && id === "findings" && summary.openFindings) badge = `<em>${summary.openFindings}</em>`;
    const currentView = state.view === id ? ' aria-current="page"' : "";
    return `<button type="button" data-nav="${id}"${currentView}><span>${number}</span>${name}${badge}</button>`;
  }).join("");
  const options = state.engagements
    .map((item) => `<option value="${esc(item.id)}"${item.id === state.currentId ? " selected" : ""}>${esc(item.client)} — ${esc(item.name)}</option>`)
    .join("");
  const head = engagement
    ? `<header class="main-head">
        <div><p class="kicker">${esc(engagement.client)}</p><h1>${esc(labelForView())}</h1></div>
        <div class="head-meta">${pill(engagement.status)}<span>${esc(prettyDate(engagement.periodStart))} – ${esc(prettyDate(engagement.periodEnd))}</span></div>
      </header>
      <p class="lede">${esc(VIEW_COPY[state.view] || "")}</p>`
    : "";
  return `<div class="app">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">Fn</div><div><strong>Fieldnote</strong><em>IT audit workbench</em></div></div>
      <nav class="nav">${nav}</nav>
      <div class="side-foot">
        ${options ? `<label>Engagement<select id="switcher">${options}</select></label>` : ""}
        <button type="button" class="ghost" data-action="open-create">New engagement</button>
        <p class="fine">Workpaper aid for planning, testing, and write-up. Not an assurance report.</p>
      </div>
    </aside>
    <main class="main">
      ${head}
      <div id="notice" class="notice${state.noticeError ? " error" : ""}" role="status">${esc(state.notice)}</div>
      <div id="view">${engagement ? viewHtml(engagement) : emptyHtml()}</div>
    </main>
  </div>
  ${createDialog()}`;
}

function labelForView() {
  return VIEWS.find(([id]) => id === state.view)?.[2] || "Desk";
}

function emptyHtml() {
  return `<section class="empty">
    <h1>Start an engagement</h1>
    <p class="lede">Fieldnote keeps the audit program, evidence requests, samples, and findings in one workpaper instead of a stack of spreadsheets.</p>
    <div class="inline">
      <button type="button" class="primary" data-action="open-create">New engagement</button>
      <button type="button" class="ghost" data-action="load-sample">Load the Northwind sample</button>
    </div>
  </section>`;
}

function createDialog() {
  if (!state.showCreate) return "";
  const boxes = state.frameworks
    .map((framework) => `<label><input type="checkbox" name="frameworks" value="${esc(framework.id)}"${framework.id === "sox-itgc" || framework.id === "soc2" ? " checked" : ""} /> ${esc(framework.label)}</label>`)
    .join("");
  return `<dialog id="create-dialog">
    <form class="dialog-card" data-form="create">
      <h2>New engagement</h2>
      <p class="lede">Name the client and the period. You can add systems and controls after this.</p>
      <div class="grid-2">
        <label class="field"><span>Client</span><input name="client" required /></label>
        <label class="field"><span>Engagement</span><input name="name" required placeholder="FY26 IT general controls" /></label>
        <label class="field"><span>Period start</span><input name="periodStart" type="date" value="2026-01-01" required /></label>
        <label class="field"><span>Period end</span><input name="periodEnd" type="date" value="2026-12-31" required /></label>
      </div>
      <label class="field" style="margin-top:0.7rem"><span>Frameworks</span><div class="checks">${boxes}</div></label>
      <label class="field" style="margin-top:0.7rem"><span>Objective</span><textarea name="objective" placeholder="What this engagement is trying to conclude."></textarea></label>
      <div class="actions-row">
        <button type="button" class="ghost" data-action="close-create">Cancel</button>
        <button type="submit" class="primary">Create</button>
      </div>
    </form>
  </dialog>`;
}

function viewHtml(engagement) {
  if (state.view === "desk") return deskHtml(engagement);
  if (state.view === "scope") return scopeHtml(engagement);
  if (state.view === "program") return programHtml(engagement);
  if (state.view === "requests") return requestsHtml(engagement);
  if (state.view === "testing") return testingHtml(engagement);
  if (state.view === "findings") return findingsHtml(engagement);
  if (state.view === "report") {
    const ready = state.reportFor === engagement.id ? state.reportHtml : "";
    return `<div class="report-tools"><button type="button" class="ghost" data-action="copy-report">Copy markdown</button><button type="button" class="ghost" data-action="download-report">Download</button><button type="button" class="ghost" data-action="print-report">Print</button></div><article class="sheet" id="report-sheet">${ready || "<p>Preparing the workpaper…</p>"}</article>`;
  }
  return "";
}

function deskHtml(engagement) {
  const summary = state.summary;
  if (!summary) return "<p>Loading the desk…</p>";
  const stats = [
    ["In the program", summary.included, "controls"],
    ["Tested", summary.tested, `of ${summary.included}`],
    ["Evidence outstanding", summary.evidenceOutstanding, `${summary.evidenceOverdue} past due`],
    ["Open findings", summary.openFindings, `${summary.findingsBySeverity.high} high`],
  ];
  const bars = summary.domains.length
    ? summary.domains.map((domain) => {
        const width = domain.included ? Math.round((domain.tested / domain.included) * 100) : 0;
        return `<div><div class="bar-label"><span>${esc(domain.domain)}</span><span>${domain.tested}/${domain.included} tested</span></div><div class="track"><i style="width:${width}%"></i></div></div>`;
      }).join("")
    : "<p>No controls in the program yet.</p>";
  const actions = summary.nextActions.map((item) => `<li>${esc(item)}</li>`).join("");
  const findings = engagement.findings.filter((finding) => finding.status !== "closed");
  const findingHtml = findings.length
    ? findings.map((finding) => `<div class="finding-row"><div><strong>${esc(finding.title)}</strong><p>${esc(finding.controlId)} · ${esc(label(finding.status))}</p></div>${pill(finding.severity)}</div>`).join("")
    : "<p>No open findings.</p>";
  return `<section class="stats">${stats.map(([name, value, note]) => `<article class="stat"><span>${esc(name)}</span><strong>${esc(value)}</strong><em>${esc(note)}</em></article>`).join("")}</section>
    <div class="split">
      <article class="card"><h2>By domain</h2><div class="bars">${bars}</div></article>
      <article class="card"><h2>Next</h2><ul class="actions">${actions}</ul></article>
    </div>
    <article class="card" style="margin-top:0.8rem"><h2>Open findings</h2>${findingHtml}</article>`;
}

function scopeHtml(engagement) {
  const frameworkBoxes = state.frameworks
    .map((framework) => `<label><input type="checkbox" name="frameworks" value="${esc(framework.id)}"${engagement.frameworks.includes(framework.id) ? " checked" : ""} /> ${esc(framework.label)}</label>`)
    .join("");
  const systems = engagement.systems.map((system) => `<div class="system grid-2">
      <label class="field"><span>System</span><input name="system-name-${esc(system.id)}" value="${esc(system.name)}" /></label>
      <label class="field"><span>Owner</span><input name="system-owner-${esc(system.id)}" value="${esc(system.owner)}" /></label>
      <label class="field"><span>Criticality</span><select name="system-criticality-${esc(system.id)}">${["high", "medium", "low"].map((risk) => `<option value="${risk}"${system.criticality === risk ? " selected" : ""}>${label(risk)}</option>`).join("")}</select></label>
      <label class="field"><span>What it does</span><input name="system-description-${esc(system.id)}" value="${esc(system.description)}" /></label>
      <button type="button" class="quiet" data-action="remove-system" data-id="${esc(system.id)}">Remove system</button>
    </div>`).join("");
  return `<form data-form="scope" class="panel">
    <div class="grid-2">
      <label class="field"><span>Client</span><input name="client" value="${esc(engagement.client)}" required /></label>
      <label class="field"><span>Engagement</span><input name="name" value="${esc(engagement.name)}" required /></label>
      <label class="field"><span>Period start</span><input type="date" name="periodStart" value="${esc(engagement.periodStart)}" required /></label>
      <label class="field"><span>Period end</span><input type="date" name="periodEnd" value="${esc(engagement.periodEnd)}" required /></label>
    </div>
    <div class="grid-2" style="margin-top:0.75rem">
      <label class="field"><span>Status</span><select name="status">${["planning", "fieldwork", "reporting", "closed"].map((status) => `<option value="${status}"${engagement.status === status ? " selected" : ""}>${label(status)}</option>`).join("")}</select></label>
      <div class="field"><span>Frameworks</span><div class="checks">${frameworkBoxes}</div></div>
    </div>
    <label class="field" style="margin-top:0.75rem"><span>Objective</span><textarea name="objective">${esc(engagement.objective)}</textarea></label>
    <div class="grid-2" style="margin-top:0.75rem">
      <label class="field"><span>In scope, one line each</span><textarea name="scopeIn">${esc(engagement.scopeIn.join("\n"))}</textarea></label>
      <label class="field"><span>Out of scope, one line each</span><textarea name="scopeOut">${esc(engagement.scopeOut.join("\n"))}</textarea></label>
    </div>
    <h2 style="margin-top:1rem">Systems</h2>
    ${systems || "<p>No systems yet.</p>"}
    <div class="inline" style="margin-top:0.9rem">
      <button type="submit" class="primary">Save scope</button>
      <button type="button" class="ghost" data-action="add-system">Add system</button>
      <button type="button" class="danger" data-action="delete-engagement">Delete engagement</button>
    </div>
  </form>`;
}

function programControls(engagement) {
  const query = state.programQuery.trim().toLowerCase();
  return state.catalog.filter((item) => {
    if (state.programDomain !== "all" && item.domain !== state.programDomain) return false;
    const outside = !engagement.frameworks.some((framework) => frameworkMatches(item, framework));
    if (outside && state.programDomain !== "all") return false;
    if (!query) return !outside || engagement.program.some((entry) => entry.controlId === item.id);
    const haystack = `${item.id} ${item.title} ${item.domain} ${item.soc2.join(" ")} ${item.iso.join(" ")} ${item.nist.join(" ")}`.toLowerCase();
    return haystack.includes(query);
  });
}

function frameworkMatches(item, framework) {
  if (framework === "sox-itgc") return Boolean(item.sox);
  if (framework === "soc2") return item.soc2.length > 0;
  if (framework === "iso27001") return item.iso.length > 0;
  return item.nist.length > 0;
}

function programRowsHtml(engagement = current()) {
  const groups = new Map();
  for (const item of programControls(engagement)) {
    if (!groups.has(item.domain)) groups.set(item.domain, []);
    groups.get(item.domain).push(item);
  }
  let html = "";
  for (const [domain, items] of groups) {
    html += `<tr class="domain-label"><td colspan="5">${esc(domain)}</td></tr>`;
    for (const item of items) {
      const program = engagement.program.find((entry) => entry.controlId === item.id);
      const checked = program?.included ? " checked" : "";
      const dim = program?.included ? "" : " dim";
      html += `<tr class="${dim}">
        <td><input type="checkbox" data-action="toggle-include" data-id="${esc(item.id)}"${checked} aria-label="Include ${esc(item.id)}" /></td>
        <td><div class="control-id">${esc(item.id)}${item.keyControl ? " · key" : ""}</div><div class="control-title">${esc(item.title)}</div><div class="chips">${chips(item)}</div>
          <input class="rationale" data-action="rationale" data-id="${esc(item.id)}" value="${esc(program?.rationale || "")}" placeholder="Why this risk, or why it is out" ${program ? "" : "disabled"} /></td>
        <td>${esc(item.nature)}<br />${esc(item.frequency)}</td>
        <td><select data-action="set-risk" data-id="${esc(item.id)}" ${program?.included ? "" : "disabled"}>${["high", "medium", "low"].map((risk) => `<option value="${risk}"${program?.inherentRisk === risk ? " selected" : ""}>${label(risk)}</option>`).join("")}</select></td>
        <td>${program?.included ? pill(program.status) : "—"}</td>
      </tr>`;
    }
  }
  return html || `<tr><td colspan="5">No controls match.</td></tr>`;
}

function programHtml(engagement) {
  const domains = ["all", ...state.domains].map((domain) => `<option value="${esc(domain)}"${state.programDomain === domain ? " selected" : ""}>${domain === "all" ? "All domains" : esc(domain)}</option>`).join("");
  const inProgram = included(engagement).length;
  return `<div class="toolbar">
      <label class="field grow"><span>Search</span><input id="program-search" type="search" value="${esc(state.programQuery)}" placeholder="Control, criterion, or keyword" /></label>
      <label class="field"><span>Domain</span><select id="program-domain">${domains}</select></label>
      <button type="button" class="primary" data-action="add-mapped">Add controls for selected frameworks</button>
    </div>
    <p class="lede">${inProgram} in the program. Unchecked controls stay in the library. Adding controls will not turn a removed control back on.</p>
    <table class="data"><thead><tr><th>In</th><th>Control</th><th>Nature</th><th>Inherent risk</th><th>Status</th></tr></thead><tbody id="program-body">${programRowsHtml(engagement)}</tbody></table>`;
}

function requestsHtml(engagement) {
  const asOf = state.summary?.asOf || "";
  const filters = ["all", "outstanding", "overdue"].map((filter) => `<button type="button" class="${state.requestFilter === filter ? "primary" : "ghost"}" data-action="filter-requests" data-filter="${filter}">${esc(label(filter === "all" ? "All" : filter))}</button>`).join("");
  const rows = engagement.evidence.filter((request) => {
    const outstanding = ["draft", "requested", "insufficient"].includes(request.status);
    const overdue = outstanding && request.dueDate && asOf && request.dueDate < asOf;
    if (state.requestFilter === "outstanding") return outstanding;
    if (state.requestFilter === "overdue") return overdue;
    return true;
  });
  const body = rows.map((request) => {
    const item = control(request.controlId);
    const overdue = ["draft", "requested", "insufficient"].includes(request.status) && request.dueDate && asOf && request.dueDate < asOf;
    return `<tr data-request="${esc(request.id)}">
      <td><div class="control-id">${esc(request.controlId)}</div><div>${esc(item?.title || "")}</div></td>
      <td><textarea data-field="description">${esc(request.description)}</textarea></td>
      <td><input data-field="owner" value="${esc(request.owner)}" /></td>
      <td><input type="date" data-field="dueDate" value="${esc(request.dueDate)}" />${overdue ? `<div style="margin-top:0.3rem">${pill("overdue", "")}</div>` : ""}</td>
      <td><select data-field="status">${["draft", "requested", "received", "insufficient", "waived"].map((status) => `<option value="${status}"${request.status === status ? " selected" : ""}>${label(status)}</option>`).join("")}</select>
        <textarea data-field="notes" placeholder="Notes">${esc(request.notes)}</textarea>
        <button type="button" class="quiet" data-action="delete-request" data-id="${esc(request.id)}">Remove</button></td>
    </tr>`;
  }).join("");
  return `<div class="toolbar"><div class="inline">${filters}</div><button type="button" class="primary" data-action="generate-requests">Add requests for controls that have none</button></div>
    ${rows.length ? `<table class="data"><thead><tr><th>Control</th><th>Ask for</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>${body}</tbody></table>` : `<article class="card"><p>No requests on this filter. Add them from the included controls, then chase the ones that are late.</p></article>`}`;
}

function testingHtml(engagement) {
  const items = included(engagement);
  if (!items.length) return `<article class="card"><p>Add controls to the program before testing.</p></article>`;
  if (!items.some((item) => item.controlId === state.testControlId)) state.testControlId = items.find((item) => item.status !== "reviewed")?.controlId || items[0].controlId;
  const rail = items.map((item) => {
    const itemControl = control(item.controlId);
    const currentItem = item.controlId === state.testControlId ? ' aria-current="true"' : "";
    return `<button type="button" data-nav="testing" data-arg="${esc(item.controlId)}"${currentItem}><strong>${esc(item.controlId)}</strong><small>${esc(itemControl?.title || "")}</small>${pill(item.status)}</button>`;
  }).join("");
  const item = control(state.testControlId);
  const program = engagement.program.find((entry) => entry.controlId === state.testControlId);
  const test = testOf(engagement, state.testControlId) || {};
  const findings = engagement.findings.filter((finding) => finding.controlId === state.testControlId);
  const radios = (name, selected) => ["not-tested", "effective", "exception", "ineffective"].map((value) => `<label><input type="radio" name="${name}" value="${value}"${(selected || "not-tested") === value ? " checked" : ""} /> ${label(value)}</label>`).join("");
  const tolerable = test.tolerableRate ? String(Math.round(test.tolerableRate * 1000) / 10) : "";
  return `<div class="testing">
    <aside class="card rail">${rail}</aside>
    <form class="panel" data-form="test" data-control="${esc(state.testControlId)}">
      <p class="kicker">${esc(item?.domain || "")}${item?.keyControl ? " · key control" : ""} · inherent risk ${esc(program?.inherentRisk || "")}</p>
      <h2>${esc(item?.title || state.testControlId)}</h2>
      <p style="margin:0.4rem 0">${esc(item?.objective || "")}</p>
      <p><strong>What can go wrong.</strong> ${esc(item?.risk || "")}</p>
      ${chips(item || { sox: null, soc2: [], iso: [], nist: [] })}
      <h3 style="margin-top:1rem">Procedure</h3>
      <ol class="steps">${(item?.steps || []).map((step) => `<li>${esc(step)}</li>`).join("")}</ol>
      <p><strong>Evidence to ask for.</strong> ${esc((item?.evidence || []).join("; "))}</p>
      <h3 style="margin-top:1rem">Design</h3>
      <div class="checks">${radios("designConclusion", test.designConclusion)}</div>
      <label class="field" style="margin-top:0.5rem"><span>Design notes</span><textarea name="designNotes">${esc(test.designNotes || "")}</textarea></label>
      <h3 style="margin-top:1rem">Operating effectiveness</h3>
      <div class="sample-box">
        <div class="grid-3">
          <label class="field"><span>Population size</span><input name="populationSize" type="number" min="1" step="1" value="${esc(test.populationSize ?? "")}" /></label>
          <label class="field"><span>Confidence</span><select name="confidence">${[0.9, 0.95, 0.99].map((value) => `<option value="${value}"${Number(test.confidence) === value ? " selected" : ""}>${value * 100}%</option>`).join("")}</select></label>
          <label class="field"><span>Tolerable rate %</span><input name="tolerableRate" type="number" min="0.1" max="99" step="0.1" value="${esc(tolerable)}" /></label>
          <label class="field"><span>Expected deviations</span><input name="expectedDeviations" type="number" min="0" max="10" step="1" value="${esc(test.expectedDeviations ?? 0)}" /></label>
          <label class="field"><span>Exceptions found</span><input name="exceptionsFound" type="number" min="0" step="1" value="${esc(test.exceptionsFound ?? 0)}" /></label>
          <div class="field"><span>Preset</span><button type="button" class="ghost" data-action="use-preset" data-risk="${esc(program?.inherentRisk || "medium")}">Use ${esc(program?.inherentRisk || "medium")} risk preset</button></div>
        </div>
        <label class="field" style="margin-top:0.6rem"><span>Population description</span><input name="populationDescription" value="${esc(test.populationDescription || "")}" placeholder="What the population is, and where it came from" /></label>
        <div class="inline" style="margin-top:0.6rem"><button type="button" class="ghost" data-action="calculate-sample">Calculate sample</button></div>
        <div id="sample-result">${sampleNarrative(test)}</div>
      </div>
      <div class="checks">${radios("operatingConclusion", test.operatingConclusion)}</div>
      <label class="field" style="margin-top:0.5rem"><span>Operating notes</span><textarea name="operatingNotes">${esc(test.operatingNotes || "")}</textarea></label>
      <label class="field" style="margin-top:0.5rem"><span>Exception detail</span><textarea name="exceptionNotes">${esc(test.exceptionNotes || "")}</textarea></label>
      <div class="grid-2" style="margin-top:0.7rem">
        <label class="field"><span>Preparer</span><input name="preparer" value="${esc(test.preparer || "")}" /></label>
        <label class="field"><span>Prepared</span><input type="date" name="preparedDate" value="${esc(test.preparedDate || "")}" /></label>
        <label class="field"><span>Reviewer</span><input name="reviewerSignoff" value="${esc(test.reviewerSignoff || "")}" /></label>
        <label class="field"><span>Reviewed</span><input type="date" name="reviewedDate" value="${esc(test.reviewedDate || "")}" /></label>
      </div>
      <div class="inline" style="margin-top:0.9rem">
        <button type="submit" class="primary">Save test</button>
        <button type="button" class="ghost" data-action="draft-finding">Draft a finding</button>
      </div>
      ${findings.length ? `<p style="margin-top:0.8rem">Findings on this control: ${findings.map((finding) => `<button type="button" class="quiet" data-nav="findings" data-arg="${esc(finding.id)}">${esc(finding.title)}</button>`).join("")}</p>` : ""}
      <p class="lede" style="margin-top:0.8rem">Sample sizes use a Poisson reliability factor, then a finite-population correction. A result inside the tolerable rate does not erase a deviation you actually found.</p>
    </form>
  </div>`;
}

function sampleNarrative(test) {
  if (!test.sampleSize) return "";
  const upper = test.upperDeviationRate === null || test.upperDeviationRate === undefined ? "" : ` Upper deviation limit ${formatPercent(test.upperDeviationRate)}.`;
  const support = test.statisticalSupport === true ? " The sample supports the tolerable rate." : test.statisticalSupport === false ? " The sample does not support the tolerable rate." : "";
  return `<p style="margin-top:0.6rem">Planned sample ${esc(test.sampleSize)} of ${esc(test.populationSize)}.${esc(upper)}${esc(support)}</p>`;
}

function formatPercent(rate) {
  const percent = Math.round(rate * 1000) / 10;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

function findingsHtml(engagement) {
  if (!state.findingId || !engagement.findings.some((finding) => finding.id === state.findingId)) {
    state.findingId = engagement.findings[0]?.id || null;
  }
  const list = engagement.findings.map((finding) => `<button type="button" class="finding-link" data-nav="findings" data-arg="${esc(finding.id)}"${finding.id === state.findingId ? ' aria-current="true"' : ""}><strong>${esc(finding.title)}</strong><br />${pill(finding.severity)} ${pill(finding.status)}</button>`).join("");
  const finding = engagement.findings.find((item) => item.id === state.findingId);
  const options = included(engagement).map((item) => `<option value="${esc(item.controlId)}"${finding?.controlId === item.controlId ? " selected" : ""}>${esc(item.controlId)} ${esc(control(item.controlId)?.title || "")}</option>`).join("");
  const form = finding
    ? `<form class="panel" data-form="finding" data-id="${esc(finding.id)}">
        <label class="field"><span>Title</span><input name="title" value="${esc(finding.title)}" required /></label>
        <div class="grid-2" style="margin-top:0.7rem">
          <label class="field"><span>Control</span><select name="controlId">${options}</select></label>
          <label class="field"><span>Severity</span><select name="severity">${["critical", "high", "medium", "low"].map((severity) => `<option value="${severity}"${finding.severity === severity ? " selected" : ""}>${label(severity)}</option>`).join("")}</select></label>
          <label class="field"><span>Status</span><select name="status">${["draft", "issued", "responded", "closed"].map((status) => `<option value="${status}"${finding.status === status ? " selected" : ""}>${label(status)}</option>`).join("")}</select></label>
          <label class="field"><span>Owner</span><input name="owner" value="${esc(finding.owner)}" /></label>
          <label class="field"><span>Target date</span><input type="date" name="targetDate" value="${esc(finding.targetDate)}" /></label>
        </div>
        ${["condition", "criteria", "cause", "effect", "recommendation", "managementResponse"].map((name) => `<label class="field" style="margin-top:0.7rem"><span>${esc(label(name === "managementResponse" ? "Management response" : name))}</span><textarea name="${name}">${esc(finding[name])}</textarea></label>`).join("")}
        <div class="inline" style="margin-top:0.9rem">
          <button type="submit" class="primary">Save finding</button>
          <button type="button" class="danger" data-action="delete-finding" data-id="${esc(finding.id)}">Delete finding</button>
        </div>
      </form>`
    : `<article class="card"><p>No findings yet. Draft one from a test, or write one here.</p></article>`;
  return `<div class="findings">
    <aside class="card"><button type="button" class="primary" data-action="new-finding">New finding</button>${list || "<p style='margin-top:0.7rem'>None yet.</p>"}</aside>
    ${form}
  </div>`;
}

function render() {
  const engagement = current();
  document.title = engagement ? `${labelForView()} · ${engagement.client} · Fieldnote` : "Fieldnote — IT audit workbench";
  document.getElementById("app").innerHTML = shell(engagement);
  const dialog = document.getElementById("create-dialog");
  if (dialog && !dialog.open) dialog.showModal();
  const search = document.getElementById("program-search");
  if (search) {
    search.addEventListener("input", () => {
      state.programQuery = search.value;
      const body = document.getElementById("program-body");
      if (body) body.innerHTML = programRowsHtml();
    });
  }
  if (state.view === "report" && engagement) loadReport(engagement.id);
}

async function loadReport(id) {
  try {
    const report = await api(`/api/engagements/${id}/report`);
    if (current()?.id !== id || state.view !== "report") return;
    state.reportFor = id;
    state.reportHtml = report.html;
    state.reportMarkdown = report.markdown;
    const sheet = document.getElementById("report-sheet");
    if (sheet) sheet.innerHTML = report.html;
  } catch (error) {
    flash(error.message, true);
  }
}

function lines(value) {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function readScope(form, engagement) {
  const data = new FormData(form);
  const next = structuredClone(engagement);
  next.client = String(data.get("client") || "").trim();
  next.name = String(data.get("name") || "").trim();
  next.periodStart = String(data.get("periodStart") || "");
  next.periodEnd = String(data.get("periodEnd") || "");
  next.status = String(data.get("status") || next.status);
  next.objective = String(data.get("objective") || "");
  next.scopeIn = lines(data.get("scopeIn"));
  next.scopeOut = lines(data.get("scopeOut"));
  next.frameworks = data.getAll("frameworks").map(String);
  next.systems = next.systems.map((system) => ({
    ...system,
    name: String(data.get(`system-name-${system.id}`) || "").trim(),
    owner: String(data.get(`system-owner-${system.id}`) || "").trim(),
    criticality: String(data.get(`system-criticality-${system.id}`) || system.criticality),
    description: String(data.get(`system-description-${system.id}`) || "").trim(),
  }));
  return next;
}

function readRequests(engagement) {
  const next = structuredClone(engagement);
  for (const row of document.querySelectorAll("[data-request]")) {
    const request = next.evidence.find((item) => item.id === row.dataset.request);
    if (!request) continue;
    for (const field of ["description", "owner", "dueDate", "status", "notes"]) {
      const input = row.querySelector(`[data-field="${field}"]`);
      if (input) request[field] = input.value;
    }
    if (request.status === "received" && !request.receivedDate) request.receivedDate = state.summary?.asOf || "";
    if (request.status !== "received") request.receivedDate = request.receivedDate || "";
  }
  return next;
}

function readTest(form) {
  const data = new FormData(form);
  const population = String(data.get("populationSize") || "");
  return {
    designConclusion: String(data.get("designConclusion") || "not-tested"),
    designNotes: String(data.get("designNotes") || ""),
    operatingConclusion: String(data.get("operatingConclusion") || "not-tested"),
    operatingNotes: String(data.get("operatingNotes") || ""),
    populationSize: population ? Number(population) : null,
    populationDescription: String(data.get("populationDescription") || ""),
    confidence: population ? Number(data.get("confidence")) : null,
    tolerableRate: population ? Number(data.get("tolerableRate")) / 100 : null,
    expectedDeviations: population ? Number(data.get("expectedDeviations")) : null,
    exceptionsFound: Number(data.get("exceptionsFound") || 0),
    exceptionNotes: String(data.get("exceptionNotes") || ""),
    preparer: String(data.get("preparer") || ""),
    preparedDate: String(data.get("preparedDate") || ""),
    reviewerSignoff: String(data.get("reviewerSignoff") || ""),
    reviewedDate: String(data.get("reviewedDate") || ""),
  };
}

async function onClick(event) {
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    go(nav.dataset.nav, nav.dataset.arg);
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === "open-create") {
      state.showCreate = true;
      render();
    } else if (action === "close-create") {
      state.showCreate = false;
      render();
    } else if (action === "load-sample") {
      const data = await api("/api/sample-engagement", { method: "POST", body: "{}" });
      replaceEngagement(data.engagement, data.summary);
      state.notice = "Northwind sample loaded.";
      go("desk");
    } else if (action === "add-mapped") {
      if (!confirm("Add every control that maps to the selected frameworks and is not already in the program?")) return;
      const data = await api(`/api/engagements/${state.currentId}/suggest-program`, { method: "POST", body: "{}" });
      replaceEngagement(data.engagement, data.summary);
      state.notice = "Program updated.";
      render();
    } else if (action === "generate-requests") {
      const data = await api(`/api/engagements/${state.currentId}/generate-requests`, { method: "POST", body: "{}" });
      replaceEngagement(data.engagement, data.summary);
      state.notice = "Requests added for controls that did not have one.";
      render();
    } else if (action === "filter-requests") {
      state.requestFilter = button.dataset.filter;
      render();
    } else if (action === "delete-request") {
      const next = readRequests(current());
      next.evidence = next.evidence.filter((request) => request.id !== button.dataset.id);
      await saveEngagement(next);
    } else if (action === "add-system") {
      const form = document.querySelector("[data-form=scope]");
      const next = readScope(form, current());
      next.systems.push({ id: uid("sys"), name: "New system", owner: "", criticality: "medium", description: "" });
      await saveEngagement(next);
    } else if (action === "remove-system") {
      const form = document.querySelector("[data-form=scope]");
      const next = readScope(form, current());
      next.systems = next.systems.filter((system) => system.id !== button.dataset.id);
      await saveEngagement(next);
    } else if (action === "delete-engagement") {
      if (!confirm("Delete this engagement and its workpapers?")) return;
      await api(`/api/engagements/${state.currentId}`, { method: "DELETE" });
      state.engagements = state.engagements.filter((engagement) => engagement.id !== state.currentId);
      state.currentId = state.engagements[0]?.id || null;
      state.summary = null;
      if (state.currentId) {
        const data = await api(`/api/engagements/${state.currentId}`);
        replaceEngagement(data.engagement, data.summary);
      }
      state.notice = "Engagement deleted.";
      render();
    } else if (action === "use-preset") {
      const preset = await api("/api/sampling/preset", { method: "POST", body: JSON.stringify({ risk: button.dataset.risk }) });
      const form = button.closest("form");
      form.confidence.value = String(preset.confidence);
      form.tolerableRate.value = String(Math.round(preset.tolerableRate * 1000) / 10);
      form.expectedDeviations.value = String(preset.expectedDeviations);
      document.getElementById("sample-result").innerHTML = `<p style="margin-top:0.6rem">${esc(preset.note)}</p>`;
    } else if (action === "calculate-sample") {
      await showSample(button.closest("form"));
    } else if (action === "draft-finding") {
      const form = button.closest("form");
      await saveTest(form);
      const data = await api(`/api/engagements/${state.currentId}/findings/draft`, {
        method: "POST",
        body: JSON.stringify({ controlId: form.dataset.control }),
      });
      replaceEngagement(data.engagement, data.summary);
      state.notice = "Finding drafted. Edit it before it is issued.";
      go("findings", data.findingId);
    } else if (action === "new-finding") {
      const engagement = structuredClone(current());
      const id = uid("find");
      engagement.findings.unshift({
        id,
        controlId: included(engagement)[0]?.controlId || state.catalog[0].id,
        title: "New finding",
        severity: "medium",
        condition: "",
        criteria: "",
        cause: "",
        effect: "",
        recommendation: "",
        managementResponse: "",
        owner: "",
        targetDate: "",
        status: "draft",
      });
      await saveEngagement(engagement, { renderAfter: false });
      state.notice = "";
      go("findings", id);
    } else if (action === "delete-finding") {
      if (!confirm("Delete this finding?")) return;
      const engagement = structuredClone(current());
      engagement.findings = engagement.findings.filter((finding) => finding.id !== button.dataset.id);
      state.findingId = engagement.findings[0]?.id || null;
      await saveEngagement(engagement);
    } else if (action === "copy-report") {
      await navigator.clipboard.writeText(state.reportMarkdown);
      flash("Markdown copied.");
    } else if (action === "download-report") {
      window.location.href = `/api/engagements/${state.currentId}/report.md`;
    } else if (action === "print-report") {
      window.print();
    }
  } catch (error) {
    flash(error.message, true);
  }
}

async function showSample(form) {
  const populationSize = Number(form.populationSize.value);
  const confidence = Number(form.confidence.value);
  const tolerableRate = Number(form.tolerableRate.value) / 100;
  const expectedDeviations = Number(form.expectedDeviations.value || 0);
  const exceptionsFound = Number(form.exceptionsFound.value || 0);
  const plan = await api("/api/sampling/plan", {
    method: "POST",
    body: JSON.stringify({ populationSize, confidence, tolerableRate, expectedDeviations }),
  });
  const evaluation = await api("/api/sampling/evaluate", {
    method: "POST",
    body: JSON.stringify({ populationSize, sampleSize: plan.sampleSize, exceptionsFound, confidence, tolerableRate }),
  });
  document.getElementById("sample-result").innerHTML = `<p style="margin-top:0.6rem">${esc(plan.narrative)}</p><p>${esc(evaluation.narrative)}</p>`;
}

async function saveTest(form) {
  const data = await api(`/api/engagements/${state.currentId}/tests/${form.dataset.control}`, {
    method: "PUT",
    body: JSON.stringify(readTest(form)),
  });
  replaceEngagement(data.engagement, data.summary);
}

async function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.form) return;
  event.preventDefault();
  const submit = form.querySelector("[type=submit]");
  if (submit) submit.disabled = true;
  try {
    if (form.dataset.form === "create") {
      const data = new FormData(form);
      const created = await api("/api/engagements", {
        method: "POST",
        body: JSON.stringify({
          client: data.get("client"),
          name: data.get("name"),
          periodStart: data.get("periodStart"),
          periodEnd: data.get("periodEnd"),
          frameworks: data.getAll("frameworks"),
          objective: data.get("objective"),
        }),
      });
      state.showCreate = false;
      replaceEngagement(created.engagement, created.summary);
      state.notice = "Engagement created. Add the systems, then build the program.";
      go("scope");
    } else if (form.dataset.form === "scope") {
      const next = readScope(form, current());
      if (!next.client || !next.name) throw new Error("Client and engagement name are required.");
      if (!next.frameworks.length) throw new Error("Select at least one framework.");
      if (next.systems.some((system) => !system.name)) throw new Error("Every system needs a name.");
      await saveEngagement(next, { renderAfter: false });
      state.notice = "Scope saved.";
      render();
    } else if (form.dataset.form === "test") {
      await saveTest(form);
      state.notice = "Test saved.";
      render();
    } else if (form.dataset.form === "finding") {
      const data = new FormData(form);
      const engagement = structuredClone(current());
      const finding = engagement.findings.find((item) => item.id === form.dataset.id);
      for (const key of ["title", "controlId", "severity", "status", "owner", "targetDate", "condition", "criteria", "cause", "effect", "recommendation", "managementResponse"]) {
        finding[key] = String(data.get(key) || "");
      }
      await saveEngagement(engagement, { renderAfter: false });
      state.notice = "Finding saved.";
      render();
    }
  } catch (error) {
    flash(error.message, true);
    if (submit) submit.disabled = false;
  }
}

async function onChange(event) {
  const target = event.target;
  if (target.id === "switcher") {
    state.currentId = target.value;
    localStorage.setItem("fieldnote.engagement", state.currentId);
    const data = await api(`/api/engagements/${state.currentId}`);
    replaceEngagement(data.engagement, data.summary);
    state.notice = "";
    render();
    return;
  }
  if (target.id === "program-domain") {
    state.programDomain = target.value;
    render();
    return;
  }
  if (target.dataset.action === "toggle-include") {
    const engagement = structuredClone(current());
    let item = engagement.program.find((entry) => entry.controlId === target.dataset.id);
    if (!item) {
      const itemControl = control(target.dataset.id);
      item = {
        controlId: target.dataset.id,
        included: target.checked,
        inherentRisk: itemControl?.keyControl ? "high" : "medium",
        rationale: "",
        tester: "",
        reviewer: "",
        status: "not-started",
      };
      engagement.program.push(item);
    } else {
      item.included = target.checked;
    }
    await saveEngagement(engagement);
    return;
  }
  if (target.dataset.action === "set-risk") {
    const engagement = structuredClone(current());
    const item = engagement.program.find((entry) => entry.controlId === target.dataset.id);
    if (!item) return;
    item.inherentRisk = target.value;
    await saveEngagement(engagement);
    return;
  }
  if (target.dataset.field === "status" && target.closest("[data-request]")) {
    try {
      await saveEngagement(readRequests(current()), { renderAfter: false });
      flash("Request saved.");
      render();
    } catch (error) {
      flash(error.message, true);
    }
  }
}

async function onBlur(event) {
  const target = event.target;
  if (target.dataset?.action === "rationale") {
    const engagement = structuredClone(current());
    const item = engagement.program.find((entry) => entry.controlId === target.dataset.id);
    if (!item || item.rationale === target.value) return;
    item.rationale = target.value;
    try {
      await saveEngagement(engagement, { renderAfter: false });
      flash("Rationale saved.");
    } catch (error) {
      flash(error.message, true);
    }
  }
  if (target.dataset?.field && target.closest("[data-request]") && target.dataset.field !== "status") {
    try {
      await saveEngagement(readRequests(current()), { renderAfter: false });
      flash("Request saved.");
    } catch (error) {
      flash(error.message, true);
    }
  }
}

document.body.addEventListener("click", (event) => {
  void onClick(event);
});
document.body.addEventListener("submit", (event) => {
  void onSubmit(event);
});
document.body.addEventListener("change", (event) => {
  void onChange(event);
});
document.body.addEventListener("focusout", (event) => {
  void onBlur(event);
});
window.addEventListener("hashchange", () => {
  readHash();
  render();
});

async function boot() {
  try {
    const [catalog, list] = await Promise.all([api("/api/catalog"), api("/api/engagements")]);
    state.catalog = catalog.controls;
    state.references = catalog.references;
    state.frameworks = catalog.frameworks;
    state.domains = catalog.domains;
    state.engagements = list.engagements;
    const saved = localStorage.getItem("fieldnote.engagement");
    state.currentId = state.engagements.some((engagement) => engagement.id === saved) ? saved : state.engagements[0]?.id || null;
    readHash();
    if (state.currentId) {
      const data = await api(`/api/engagements/${state.currentId}`);
      replaceEngagement(data.engagement, data.summary);
    }
    render();
  } catch (error) {
    document.getElementById("app").innerHTML = `<p class="booting">The workbench could not be opened. ${esc(error.message)}</p>`;
  }
}

boot();
