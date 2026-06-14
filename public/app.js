const pipeline = [
  { id: "spec", label: "SPEC", status: "done" },
  { id: "sprint", label: "Sprint Plan", status: "done" },
  { id: "contract", label: "Contract", status: "active" },
  { id: "build", label: "Build", status: "queued" },
  { id: "qa", label: "QA", status: "queued" },
  { id: "evaluation", label: "Evaluation", status: "queued" },
  { id: "done", label: "Done", status: "queued" },
];

const fallbackAgents = [
  { name: "Planner", goal: "Sprint scope", status: "complete" },
  { name: "Contract", goal: "Gatekeeping", status: "complete" },
  { name: "Builder", goal: "Contract-limited implementation", status: "active" },
  { name: "QA", goal: "Contract checklist", status: "idle" },
  { name: "Evaluator", goal: "Sprint score", status: "idle" },
];

const state = {
  backendBaseUrl: window.location.protocol === "file:" ? "http://localhost:3000" : window.location.origin,
  selectedTool: "filesystem",
  activeArtifactPath: null,
  workspace: null,
  memoryIndex: null,
  memorySearchQuery: "",
  memorySearchResults: null,
  decisionTitle: "",
  decisionContent: "",
  artifact: null,
  editorContent: "",
  savedContent: "",
  loading: true,
  artifactLoading: false,
  saving: false,
  saveStatus: "idle",
  error: null,
  saveError: null,
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function statusDot(status) {
  return `<span class="status-dot ${status}" aria-hidden="true"></span>`;
}

function artifactType(path) {
  if (!path) return "Markdown";
  return path.endsWith(".json") ? "JSON" : path.endsWith(".md") ? "Markdown" : "Text";
}

function artifactIsEditable(artifact) {
  return Boolean(
    artifact?.path?.endsWith(".md") &&
      (artifact.path.startsWith(".mcp-task/specs/") ||
        artifact.path.startsWith(".mcp-task/contracts/") ||
        (artifact.path.startsWith(".mcp-task/sprints/") && artifact.path !== ".mcp-task/sprints/roadmap.md")),
  );
}

function isDirty() {
  return state.editorContent !== state.savedContent;
}

function renderShell() {
  const root = document.getElementById("root");
  const workspace = state.workspace;
  const productName = workspace?.productName || "MCP Harness Task Manager";
  const shortName = workspace?.shortName || "mcp-task";
  const currentSprint = workspace?.currentSprint || "SPRINT-006";
  const evaluation = workspace?.evaluation;
  const contractGate = workspace?.contractGate;
  const qaResult = workspace?.qaResult;
  const evaluationGate = workspace?.evaluationGate;
  const toolExecution = workspace?.toolExecution;
  const localMemory = workspace?.localMemory;
  const memoryIndex = state.memoryIndex;
  const progress = workspace?.progress;
  const agentStates = workspace?.agents?.length ? workspace.agents : fallbackAgents;
  const sprints = workspace?.sprints || [];
  const artifacts = workspace?.artifacts || [];
  const terminalEvents = workspace?.terminalEvents?.length
    ? workspace.terminalEvents
    : [{ level: state.error ? "warn" : "info", text: state.error || "mcp-task> loading workspace..." }];
  const editable = artifactIsEditable(state.artifact);

  root.innerHTML = `
    <main class="ide-shell">
      <header class="top-bar">
        <div class="brand-block">
          <div class="window-controls" aria-hidden="true"><span></span><span></span><span></span></div>
          <div>
            <p class="eyebrow">${escapeHtml(shortName)}</p>
            <h1>${escapeHtml(productName)}</h1>
          </div>
        </div>

        <div class="pipeline-status" aria-label="Current pipeline status">
          ${statusDot(state.error ? "queued" : "active")}
          <span>${state.loading ? "Carregando workspace" : state.error ? "Backend local indisponivel" : contractGate?.buildBlocked ? "Build bloqueado" : "Contract pronto"}</span>
          <strong>${escapeHtml(currentSprint)}</strong>
        </div>

        <div class="top-actions">
          <button class="icon-button" type="button" title="Recarregar workspace" aria-label="Recarregar workspace" data-refresh>R</button>
          <button class="secondary-action" type="button" ${state.error ? "disabled" : ""} data-new-spec>Nova SPEC</button>
          <button class="secondary-action" type="button" ${state.error ? "disabled" : ""} data-new-sprint>Novo Sprint</button>
          <button class="secondary-action" type="button" ${state.error ? "disabled" : ""} data-new-contract>Novo Contract</button>
          <button class="secondary-action" type="button" ${state.error ? "disabled" : ""} data-generate-tool-presets>Presets</button>
          <button class="primary-action" type="button" ${state.error || contractGate?.buildBlocked ? "disabled" : ""} data-build-gate>Build</button>
          <button class="primary-action" type="button" ${state.error || evaluationGate?.doneBlocked ? "disabled" : ""} data-done-gate>Done</button>
        </div>
      </header>

      <section class="workspace-grid">
        <aside class="left-sidebar" aria-label="Project navigation">
          <nav class="nav-section">
            <h2>Pipeline</h2>
            ${currentPipeline(contractGate, progress, evaluationGate).map((step) => `
              <button class="nav-item ${step.status}" type="button">
                ${statusDot(step.status)}
                <span>${escapeHtml(step.label)}</span>
              </button>
            `).join("")}
          </nav>

          <div class="nav-section">
            <h2>Sprints</h2>
            ${sprints.length ? sprints.map((sprint) => `
              <button class="nav-item ${sprint.id === currentSprint ? "active" : ""}" type="button" data-artifact-path="${escapeHtml(sprint.path)}">
                ${statusDot(sprint.status === "passed" || sprint.status === "done" ? "done" : sprint.status === "planned" ? "queued" : "active")}
                <span>${escapeHtml(sprint.id)} ${escapeHtml(sprint.title)}</span>
              </button>
            `).join("") : `<p class="empty-state">Nenhuma sprint local encontrada.</p>`}
          </div>

          <div class="nav-section">
            <h2>MCP Tools</h2>
            ${["filesystem", "memory", "terminal", "registry"].map((tool) => `
              <button class="nav-item ${state.selectedTool === tool ? "selected" : ""}" type="button" data-tool="${tool}">
                <span class="tool-glyph">${tool.slice(0, 2).toUpperCase()}</span>
                <span>${escapeHtml(tool)}</span>
              </button>
            `).join("")}
          </div>

          <div class="nav-section">
            <h2>Agents</h2>
            ${agentStates.map((agent) => `
              <div class="agent-row">
                ${statusDot(agentStatusClass(agent.status))}
                <div><strong>${escapeHtml(agent.name)}</strong><span>${escapeHtml(agent.goal || agent.role || "Agent")}</span></div>
              </div>
            `).join("")}
          </div>
        </aside>

        <section class="editor-area" aria-label="Main task documents">
          <div class="tabs" role="tablist" aria-label="Workspace artifacts">${renderTabs(artifacts)}</div>

          <div class="editor-toolbar">
            <div>
              <strong class="editor-toolbar-title">${escapeHtml(activeTitle())}</strong>
              <span class="editor-toolbar-type">${escapeHtml(activeType())}</span>
              <span class="save-pill ${saveClass()}">${escapeHtml(saveLabel())}</span>
            </div>
            <div class="toolbar-actions">
              <button class="primary-action" type="button" ${!editable || !isDirty() || state.saving ? "disabled" : ""} data-save-artifact>
                ${state.saving ? "Salvando" : "Salvar"}
              </button>
            </div>
          </div>

          <article class="document-pane ${editable ? "editing" : ""}">
            <ol class="line-numbers" aria-hidden="true">${renderLineNumbers()}</ol>
            ${editable
              ? `<textarea class="markdown-editor" spellcheck="false" aria-label="Editor Markdown">${escapeHtml(state.editorContent)}</textarea>`
              : `<pre>${escapeHtml(activeContent())}</pre>`}
          </article>

          <section class="task-details" aria-label="Current task details">
            <div>
              <p class="eyebrow">Sprint atual</p>
              <h2>${escapeHtml(currentSprint)}</h2>
            </div>
            <p>${escapeHtml(authoringMessage())}</p>
          </section>
        </section>

        <aside class="right-sidebar" aria-label="Sprint status">
          <section class="status-panel">
            <h2>Sprint status</h2>
            <div class="score-ring" aria-label="Evaluation score ${evaluationGate?.score ?? evaluation?.score ?? 0} percent">
              <strong>${evaluationGate?.score ?? evaluation?.score ?? "--"}</strong><span>/100</span>
            </div>
            <p>${escapeHtml(evaluationGate?.message || (evaluation ? `${evaluation.sprintId} ${evaluation.status}` : "Nenhuma avaliacao carregada."))}</p>
          </section>

          <section class="status-panel">
            <h2>Artifacts</h2>
            <div class="artifact-list">
              ${artifacts.length ? artifacts.map((artifact) => `
                <button class="${artifact.path === state.activeArtifactPath ? "active" : ""}" type="button" data-artifact-path="${escapeHtml(artifact.path)}">
                  <span>${escapeHtml(artifact.kind)}</span>
                  <strong>${escapeHtml(artifact.title)}</strong>
                </button>
              `).join("") : `<p class="empty-state">Sem artefatos locais.</p>`}
            </div>
          </section>

          <section class="status-panel">
            <h2>Contract gate</h2>
            <p class="gate-message ${contractGate?.buildBlocked ? "blocked" : "ready"}">${escapeHtml(contractGate?.message || "Contract status unavailable.")}</p>
            <div class="checklist">
              ${contractChecklist(contractGate).map(([label, checked]) => `
                <label><input type="checkbox" ${checked ? "checked" : ""} readonly><span>${escapeHtml(label)}</span></label>
              `).join("")}
            </div>
          </section>

          <section class="status-panel">
            <h2>Execution harness</h2>
            ${renderToolExecutionPanel(toolExecution)}
          </section>

          <section class="status-panel">
            <h2>Local memory</h2>
            ${renderLocalMemoryPanel(localMemory, memoryIndex)}
          </section>

          <section class="status-panel">
            <h2>Activity timeline</h2>
            <ol class="activity-list">
              ${activityEvents(progress).map((event) => `
                <li>
                  <time>${escapeHtml(shortTime(event.timestamp))}</time>
                  <span><strong>${escapeHtml(event.agent)}</strong> ${escapeHtml(event.message)}</span>
                </li>
              `).join("")}
            </ol>
          </section>

          <section class="status-panel">
            <h2>QA checklist</h2>
            <div class="checklist qa-checklist">
              ${qaChecklist(qaResult).map((item) => `
                <label class="${escapeHtml(item.status)}">
                  <input type="checkbox" ${item.status === "passed" ? "checked" : ""} readonly>
                  <span>${escapeHtml(item.label)}</span>
                </label>
              `).join("")}
            </div>
          </section>

          <section class="status-panel">
            <h2>Quality checklist</h2>
            <div class="checklist">
              ${qualityChecklist().map(([label, checked]) => `
                <label><input type="checkbox" ${checked ? "checked" : ""} readonly><span>${escapeHtml(label)}</span></label>
              `).join("")}
            </div>
          </section>
        </aside>
      </section>

      <section class="bottom-panel" aria-label="Visual terminal and logs">
        <div class="panel-tabs">
          <button class="active" type="button">Terminal</button>
          <button type="button">Agent logs</button>
          <button type="button">Pipeline events</button>
        </div>
        <div class="terminal">
          ${terminalEvents.map((event) => `<p class="${escapeHtml(event.level)}">${escapeHtml(event.text)}</p>`).join("")}
          <p class="cursor-line">mcp-task&gt; <span class="cursor"></span></p>
        </div>
      </section>
    </main>
  `;

  bindEvents();
}

function renderTabs(artifacts) {
  if (state.loading) return `<button class="active" type="button">loading.md</button>`;
  if (state.error) return `<button class="active" type="button">workspace-error.md</button>`;

  const preferred = artifacts.filter((artifact) => ["roadmap", "spec", "sprint", "contract", "evaluation"].includes(artifact.kind));
  return preferred.slice(0, 8).map((artifact) => `
    <button class="${artifact.path === state.activeArtifactPath ? "active" : ""}" type="button" role="tab" data-artifact-path="${escapeHtml(artifact.path)}">
      ${escapeHtml(artifact.title)}
    </button>
  `).join("");
}

function currentPipeline(contractGate, progress, evaluationGate) {
  const stage = progress?.stage;
  return pipeline.map((step) => {
    if (step.id === "build") {
      return { ...step, status: contractGate && !contractGate.buildBlocked ? "active" : "queued" };
    }
    if (step.id === "contract") {
      return { ...step, status: contractGate && !contractGate.buildBlocked ? "done" : "active" };
    }
    if (stage && step.label === stage) {
      return { ...step, status: "active" };
    }
    if (step.id === "done") {
      return { ...step, status: evaluationGate && !evaluationGate.doneBlocked ? "done" : "queued" };
    }
    if (step.id === "evaluation" && evaluationGate) {
      return { ...step, status: evaluationGate.doneBlocked ? "active" : "done" };
    }
    return step;
  });
}

function agentStatusClass(status) {
  if (status === "complete") return "complete";
  if (status === "active") return "running";
  if (status === "blocked") return "queued";
  if (status === "failed") return "error";
  return "queued";
}

function activeTitle() {
  if (state.artifact) return state.artifact.title;
  if (state.loading) return "loading.md";
  if (state.error) return "workspace-error.md";
  return "empty-workspace.md";
}

function activeType() {
  if (state.artifact) return artifactType(state.artifact.path);
  return "Markdown";
}

function activeContent() {
  if (state.artifactLoading) return "mcp-task> loading artifact...";
  if (state.artifact) return state.editorContent;
  if (state.loading) return "# Loading workspace\n\nReading .mcp-task artifacts from the local backend.";
  if (state.error) return `# Workspace unavailable\n\n${state.error}\n\nStart the backend locally to load real .mcp-task artifacts.`;
  return "# Empty workspace\n\nNo supported .mcp-task artifacts were found.";
}

function renderLineNumbers() {
  const lineCount = Math.max(1, activeContent().split(/\r?\n/).length);
  return Array.from({ length: lineCount }, (_, index) => `<li>${index + 1}</li>`).join("");
}

function qualityChecklist() {
  const hasSpec = Boolean(state.workspace?.artifacts?.some((artifact) => artifact.kind === "spec"));
  const hasSprint = Boolean(state.workspace?.artifacts?.some((artifact) => artifact.kind === "sprint"));
  const contractGate = state.workspace?.contractGate;
  const hasAgents = Boolean(state.workspace?.agents?.length);
  const hasProgress = Boolean(state.workspace?.progress);
  const qaPassed = state.workspace?.qaResult?.status === "passed";
  const evaluationPassed = Boolean(state.workspace?.evaluationGate && !state.workspace.evaluationGate.doneBlocked);
  const toolExecution = state.workspace?.toolExecution;
  const localMemory = state.workspace?.localMemory;
  return [
    ["Workspace loaded", Boolean(state.workspace)],
    ["SPEC artifacts available", hasSpec],
    ["Sprint plans available", hasSprint],
    ["Contract valid", Boolean(contractGate && !contractGate.buildBlocked)],
    ["Agent state loaded", hasAgents],
    ["Progress state loaded", hasProgress],
    ["QA passed", qaPassed],
    ["Evaluation score >= 90", evaluationPassed],
    ["Tool proposals available", Boolean(toolExecution?.commands?.length)],
    ["No failed commands", !toolExecution?.failedCommands?.length],
    ["Sprint history indexed", Boolean(localMemory?.sprintHistoryCount)],
    ["Local memory loaded", Boolean(state.memoryIndex)],
    ["Editable Markdown selected", artifactIsEditable(state.artifact)],
    ["Unsaved state tracked", isDirty()],
  ];
}

function renderLocalMemoryPanel(localMemory, memoryIndex) {
  const searchResults = state.memorySearchResults?.results || [];
  const history = memoryIndex?.sprintHistory || [];
  const decisions = memoryIndex?.documents?.filter((document) => document.type === "decision") || [];

  return `
    <div class="memory-summary">
      <span>${localMemory?.sprintHistoryCount || history.length || 0} sprints</span>
      <span>${localMemory?.decisionCount || decisions.length || 0} decisões</span>
      <span>${localMemory?.documentCount || memoryIndex?.documents?.length || 0} docs</span>
    </div>

    <form class="memory-search" data-memory-search-form>
      <input type="search" aria-label="Buscar memoria local" placeholder="Buscar .mcp-task/" value="${escapeHtml(state.memorySearchQuery)}">
      <button class="secondary-action" type="submit">Buscar</button>
    </form>

    <div class="memory-results">
      ${searchResults.length ? searchResults.slice(0, 5).map((result) => `
        <button type="button" data-artifact-path="${escapeHtml(result.path)}">
          <strong>${escapeHtml(result.title)}</strong>
          <span>${escapeHtml(result.type)} · score ${escapeHtml(result.score)}</span>
          <small>${escapeHtml(result.excerpt)}</small>
        </button>
      `).join("") : `<p class="empty-state">Sem resultados de busca.</p>`}
    </div>

    <div class="memory-history">
      <h3>Histórico</h3>
      ${history.slice().reverse().slice(0, 6).map((sprint) => `
        <article>
          <button type="button" data-artifact-path="${escapeHtml(sprint.sprintPath)}">
            <strong>${escapeHtml(sprint.sprintId)}</strong>
            <span>${escapeHtml(sprint.title)}</span>
          </button>
          <div>
            ${memorySprintLinks(sprint).map(([label, path]) => path ? `<button type="button" data-artifact-path="${escapeHtml(path)}">${escapeHtml(label)}</button>` : "").join("")}
          </div>
        </article>
      `).join("")}
    </div>

    <form class="decision-form" data-decision-form>
      <input type="text" aria-label="Titulo da decisao" placeholder="Título da decisão" value="${escapeHtml(state.decisionTitle)}">
      <textarea aria-label="Conteudo da decisao" placeholder="Decisão e contexto">${escapeHtml(state.decisionContent)}</textarea>
      <button class="primary-action" type="submit">Registrar decisão</button>
    </form>
  `;
}

function memorySprintLinks(sprint) {
  return [
    ["SPEC", sprint.specPath],
    ["Contract", sprint.contractPath],
    ["QA", sprint.qaPath],
    ["Eval", sprint.evaluationPath],
    ["Log", sprint.logPath],
  ];
}

function renderToolExecutionPanel(toolExecution) {
  if (!toolExecution) {
    return `<p class="empty-state">Nenhum estado de execucao carregado.</p>`;
  }

  const commands = toolExecution.commands || [];
  const groups = [
    ["Propostos", commands.filter((command) => command.status === "proposed")],
    ["Aprovados", commands.filter((command) => command.status === "approved")],
    ["Executados", commands.filter((command) => command.status === "executed")],
    ["Falhos", commands.filter((command) => command.status === "failed")],
  ];

  return `
    <div class="execution-summary">
      <span>${toolExecution.counts?.proposed || 0} propostos</span>
      <span>${toolExecution.counts?.approved || 0} aprovados</span>
      <span>${toolExecution.counts?.executed || 0} executados</span>
      <span class="${toolExecution.failedCommands?.length ? "failed" : ""}">${toolExecution.counts?.failed || 0} falhos</span>
    </div>
    <div class="execution-groups">
      ${groups.map(([label, items]) => `
        <div class="execution-group">
          <h3>${escapeHtml(label)}</h3>
          ${items.length ? items.map(renderCommandProposal).join("") : `<p class="empty-state">Sem comandos.</p>`}
        </div>
      `).join("")}
    </div>
  `;
}

function renderCommandProposal(command) {
  const result = state.workspace?.toolExecution?.results?.find((item) => item.proposalId === command.id);
  const canApprove = command.status === "proposed" && command.riskLevel !== "blocked";
  const canExecute = command.status === "approved";
  return `
    <article class="execution-card ${escapeHtml(command.status)} ${escapeHtml(command.riskLevel)}">
      <div>
        <strong>${escapeHtml(command.label)}</strong>
        <code>${escapeHtml([command.command, ...(command.args || [])].join(" "))}</code>
      </div>
      <div class="execution-meta">
        <span>${escapeHtml(commandStatusLabel(command.status))}</span>
        <span>${escapeHtml(command.riskLevel)}</span>
        ${typeof result?.exitCode !== "undefined" ? `<span>exit ${escapeHtml(result.exitCode)}</span>` : ""}
      </div>
      <div class="execution-actions">
        <button class="secondary-action" type="button" ${canApprove ? "" : "disabled"} data-approve-command="${escapeHtml(command.id)}">Aprovar</button>
        <button class="primary-action" type="button" ${canExecute ? "" : "disabled"} data-execute-command="${escapeHtml(command.id)}">Executar</button>
      </div>
    </article>
  `;
}

function commandStatusLabel(status) {
  const labels = {
    proposed: "proposto",
    approved: "aprovado",
    rejected: "rejeitado",
    executed: "executado",
    failed: "falhou",
  };
  return labels[status] || status;
}

function qaChecklist(qaResult) {
  return qaResult?.items?.length
    ? qaResult.items
    : [{ id: "qa-missing", label: "No QA result found for current sprint.", status: "pending" }];
}

function activityEvents(progress) {
  return progress?.events?.length
    ? progress.events.slice(-8).reverse()
    : [{ timestamp: new Date().toISOString(), agent: "System", message: "No local progress events found." }];
}

function shortTime(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "--:--" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function contractChecklist(contractGate) {
  const fields = [
    "sprint_id",
    "objective",
    "allowed_changes",
    "forbidden_changes",
    "acceptance_criteria",
    "qa_checklist",
    "expected_outputs",
    "rollback_notes",
  ];
  const missing = new Set(contractGate?.missingFields || fields);
  return fields.map((field) => [field, !missing.has(field)]);
}

function saveLabel() {
  if (state.saveError) return state.saveError;
  if (state.saving) return "Salvando...";
  if (isDirty()) return "Alteracoes nao salvas";
  if (state.saveStatus === "saved") return "Salvo";
  return artifactIsEditable(state.artifact) ? "Pronto para editar" : "Somente leitura";
}

function saveClass() {
  if (state.saveError) return "failed";
  if (state.saving) return "saving";
  if (isDirty()) return "dirty";
  if (state.saveStatus === "saved") return "saved";
  return "idle";
}

function authoringMessage() {
  if (state.error) return state.error;
  if (state.saveError) return state.saveError;
  if (!state.artifact) return "Selecione uma SPEC ou sprint plan para editar.";
  if (!artifactIsEditable(state.artifact)) return "Este artefato e somente leitura nesta sprint. Edicoes sao restritas a specs, sprints e contracts Markdown.";
  if (state.artifact.path.startsWith(".mcp-task/sprints/")) {
    return "Sprint plans precisam referenciar uma SPEC em .mcp-task/specs/ para salvar.";
  }
  if (state.artifact.path.startsWith(".mcp-task/contracts/")) {
    return "Contracts precisam conter todos os campos obrigatorios para liberar Build.";
  }
  return "SPECs sao salvas como Markdown local dentro de .mcp-task/specs/.";
}

function bindEvents() {
  document.querySelector("[data-refresh]")?.addEventListener("click", loadWorkspace);
  document.querySelector("[data-save-artifact]")?.addEventListener("click", saveArtifact);
  document.querySelector("[data-new-spec]")?.addEventListener("click", createSpecDraft);
  document.querySelector("[data-new-sprint]")?.addEventListener("click", createSprintDraft);
  document.querySelector("[data-new-contract]")?.addEventListener("click", createContractDraft);
  document.querySelector("[data-generate-tool-presets]")?.addEventListener("click", generateToolPresets);
  document.querySelector("[data-memory-search-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = event.currentTarget.querySelector("input");
    state.memorySearchQuery = input?.value || "";
    searchMemory();
  });
  document.querySelector("[data-decision-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const inputs = event.currentTarget.querySelectorAll("input, textarea");
    state.decisionTitle = inputs[0]?.value || "";
    state.decisionContent = inputs[1]?.value || "";
    saveDecisionNote();
  });
  document.querySelector("[data-build-gate]")?.addEventListener("click", () => {
    state.saveError = state.workspace?.contractGate?.buildBlocked
      ? state.workspace.contractGate.message
      : "Build gate liberado pelo Contract valido.";
    renderShell();
  });
  document.querySelector("[data-done-gate]")?.addEventListener("click", () => {
    state.saveError = state.workspace?.evaluationGate?.doneBlocked
      ? state.workspace.evaluationGate.message
      : "Done gate liberado por QA e Evaluation validos.";
    renderShell();
  });

  document.querySelector(".markdown-editor")?.addEventListener("input", (event) => {
    state.editorContent = event.target.value;
    state.saveError = null;
    renderShell();
    const textarea = document.querySelector(".markdown-editor");
    textarea?.focus();
    textarea?.setSelectionRange(event.target.selectionStart, event.target.selectionEnd);
  });

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTool = button.dataset.tool;
      renderShell();
    });
  });

  document.querySelectorAll("[data-artifact-path]").forEach((button) => {
    button.addEventListener("click", () => {
      const artifactPath = button.dataset.artifactPath;
      if (artifactPath) loadArtifact(artifactPath);
    });
  });

  document.querySelectorAll("[data-approve-command]").forEach((button) => {
    button.addEventListener("click", () => approveCommand(button.dataset.approveCommand));
  });

  document.querySelectorAll("[data-execute-command]").forEach((button) => {
    button.addEventListener("click", () => executeCommand(button.dataset.executeCommand));
  });
}

async function loadWorkspace() {
  state.loading = true;
  state.error = null;
  state.workspace = null;
  state.artifact = null;
  state.editorContent = "";
  state.savedContent = "";
  state.saveError = null;
  renderShell();

  try {
    const response = await fetch(`${state.backendBaseUrl}/workspace`, { cache: "no-store" });
    if (!response.ok) {
      const body = await safeJson(response);
      throw new Error(body.message || `Workspace request failed: ${response.status}`);
    }

    state.workspace = await response.json();
    state.activeArtifactPath = pickInitialArtifactPath(state.workspace);
    state.loading = false;
    renderShell();

    await loadMemoryIndex();
    if (state.activeArtifactPath) await loadArtifact(state.activeArtifactPath);
  } catch (error) {
    state.loading = false;
    state.error = error instanceof Error ? error.message : "Failed to load local workspace.";
    renderShell();
  }
}

async function loadArtifact(artifactPath) {
  state.activeArtifactPath = artifactPath;
  state.artifactLoading = true;
  state.artifact = null;
  state.saveError = null;
  renderShell();

  try {
    const response = await fetch(`${state.backendBaseUrl}/workspace/artifact?path=${encodeURIComponent(artifactPath)}`, { cache: "no-store" });
    if (!response.ok) {
      const body = await safeJson(response);
      throw new Error(body.message || `Artifact request failed: ${response.status}`);
    }

    state.artifact = await response.json();
    state.editorContent = state.artifact.content;
    state.savedContent = state.artifact.content;
    state.saveStatus = "idle";
  } catch (error) {
    const content = `# Artifact unavailable\n\n${error instanceof Error ? error.message : "Failed to load artifact."}`;
    state.artifact = { path: artifactPath, title: "artifact-error.md", content };
    state.editorContent = content;
    state.savedContent = content;
  } finally {
    state.artifactLoading = false;
    renderShell();
  }
}

async function saveArtifact() {
  if (!state.artifact || !artifactIsEditable(state.artifact)) return;

  state.saving = true;
  state.saveError = null;
  renderShell();

  try {
    const payload = {
      path: state.artifact.path,
      content: state.editorContent,
      specPath: state.artifact.path.startsWith(".mcp-task/sprints/") ? findReferencedSpecPath() : undefined,
    };
    const response = await fetch(`${state.backendBaseUrl}/workspace/artifact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await safeJson(response);
      const missingFields = Array.isArray(body.details?.missingFields) ? ` Missing: ${body.details.missingFields.join(", ")}` : "";
      throw new Error(`${body.message || `Save failed: ${response.status}`}${missingFields}`);
    }

    const saved = await response.json();
    state.artifact = saved;
    state.editorContent = saved.content;
    state.savedContent = saved.content;
    state.saveStatus = "saved";
    await refreshWorkspaceAfterSave(saved.path);
  } catch (error) {
    state.saveError = error instanceof Error ? error.message : "Failed to save artifact.";
    state.saveStatus = "failed";
  } finally {
    state.saving = false;
    renderShell();
  }
}

async function refreshWorkspaceAfterSave(activePath) {
  const response = await fetch(`${state.backendBaseUrl}/workspace`, { cache: "no-store" });
  if (response.ok) state.workspace = await response.json();
  await loadMemoryIndex();
  state.activeArtifactPath = activePath;
}

async function loadMemoryIndex() {
  try {
    const response = await fetch(`${state.backendBaseUrl}/workspace/memory`, { cache: "no-store" });
    if (response.ok) {
      state.memoryIndex = await response.json();
    }
  } catch {
    state.memoryIndex = null;
  }
}

async function searchMemory() {
  try {
    const response = await fetch(`${state.backendBaseUrl}/workspace/memory/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: state.memorySearchQuery, limit: 8 }),
    });

    if (!response.ok) {
      const body = await safeJson(response);
      throw new Error(body.message || `Memory search failed: ${response.status}`);
    }

    state.memorySearchResults = await response.json();
  } catch (error) {
    state.saveError = error instanceof Error ? error.message : "Memory search failed.";
  } finally {
    renderShell();
  }
}

async function saveDecisionNote() {
  try {
    const response = await fetch(`${state.backendBaseUrl}/workspace/memory/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: state.decisionTitle,
        content: state.decisionContent,
        tags: ["decision", "local-memory"],
        relatedSprintId: state.workspace?.currentSprint,
        relatedArtifactPaths: state.activeArtifactPath ? [state.activeArtifactPath] : [],
      }),
    });

    if (!response.ok) {
      const body = await safeJson(response);
      throw new Error(body.message || `Decision save failed: ${response.status}`);
    }

    const saved = await response.json();
    state.decisionTitle = "";
    state.decisionContent = "";
    state.saveStatus = "saved";
    state.saveError = `Decision saved: ${saved.path}`;
    await refreshWorkspaceAfterSave(state.activeArtifactPath);
  } catch (error) {
    state.saveError = error instanceof Error ? error.message : "Decision save failed.";
  } finally {
    renderShell();
  }
}

async function generateToolPresets() {
  await postToolHarness("/workspace/tool-harness/proposals/package-scripts", {});
}

async function approveCommand(proposalId) {
  if (!proposalId) return;
  await postToolHarness("/workspace/tool-harness/commands/approve", { proposalId });
}

async function executeCommand(proposalId) {
  if (!proposalId) return;
  await postToolHarness("/workspace/tool-harness/commands/execute", { proposalId });
}

async function postToolHarness(path, payload) {
  state.saveError = null;
  renderShell();

  try {
    const response = await fetch(`${state.backendBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await safeJson(response);
      throw new Error(body.message || `Tool harness request failed: ${response.status}`);
    }

    const toolExecution = await response.json();
    if (state.workspace) {
      state.workspace.toolExecution = toolExecution;
    }
    await refreshWorkspaceAfterSave(state.activeArtifactPath);
  } catch (error) {
    state.saveError = error instanceof Error ? error.message : "Tool harness request failed.";
  } finally {
    renderShell();
  }
}

function createSpecDraft() {
  const date = new Date().toISOString().slice(0, 10);
  const path = `.mcp-task/specs/spec-${date}.md`;
  const content = `# SPEC - ${date}\n\n## Goal\n\nDescribe the product change.\n\n## Scope\n\n- \n\n## Requirements\n\n- \n\n## Acceptance Criteria\n\n- \n`;
  setDraftArtifact(path, "spec", "Spec Draft", content);
}

function createSprintDraft() {
  const specPath = findFirstSpecPath();
  const content = `# Sprint SPRINT-NEW - Sprint Plan\n\n## Linked SPEC\n\n${specPath || "Select or create a SPEC first."}\n\n## Goal\n\nDescribe the sprint goal.\n\n## Status\n\n\`planned\`\n\n## Scope\n\n- \n\n## Tasks\n\n- [ ] \n\n## Acceptance Criteria\n\n- \n`;
  setDraftArtifact(".mcp-task/sprints/sprint-new-plan.md", "sprint", "Sprint New Plan", content);
}

function createContractDraft() {
  const sprintId = state.workspace?.currentSprint || "SPRINT-006";
  const sprintSlug = sprintId.toLowerCase();
  const path = `.mcp-task/contracts/${sprintSlug}-explicit-tool-execution.md`;
  const content = `# Contract - ${sprintId} Explicit Tool Execution Harness\n\n## sprint_id\n\n\`${sprintId}\`\n\n## objective\n\nPropose, approve, execute and audit local validation commands explicitly.\n\n## allowed_changes\n\n- Add command proposal and execution state.\n- Add user approval before execution.\n- Add local execution logs.\n- Surface failed commands in QA/Evaluation.\n\n## forbidden_changes\n\n- Do not execute commands automatically.\n- Do not approve blocked commands.\n- Do not add SaaS or database persistence.\n\n## acceptance_criteria\n\n- Commands require approval before execution.\n- Blocked commands cannot execute.\n- Logs include timestamp and exit status.\n\n## qa_checklist\n\n- [ ] Validate proposal schema.\n- [ ] Validate approval gate.\n- [ ] Validate failed command surfacing.\n\n## expected_outputs\n\n- Tool execution state.\n- IDE shell execution panel.\n- Golden tests.\n\n## rollback_notes\n\nRemove execution harness routes, state and UI panel.\n`;
  setDraftArtifact(path, "contract", "Contract Draft", content);
}

function setDraftArtifact(path, kind, title, content) {
  state.activeArtifactPath = path;
  state.artifact = { path, kind, title, content };
  state.editorContent = content;
  state.savedContent = "";
  state.saveStatus = "idle";
  state.saveError = null;
  renderShell();
}

function findFirstSpecPath() {
  return state.workspace?.artifacts?.find((artifact) => artifact.kind === "spec")?.path || "";
}

function findReferencedSpecPath() {
  const specs = state.workspace?.artifacts?.filter((artifact) => artifact.kind === "spec") || [];
  return specs.find((artifact) => state.editorContent.includes(artifact.path))?.path || specs[0]?.path || "";
}

function pickInitialArtifactPath(workspace) {
  if (!workspace?.artifacts?.length) return null;
  return (
    workspace.artifacts.find((artifact) => artifact.path === ".mcp-task/specs/sprint-003-spec-authoring.md")?.path ||
    workspace.artifacts.find((artifact) => artifact.path === ".mcp-task/specs/sprint-004-contract-gatekeeping.md")?.path ||
    workspace.artifacts.find((artifact) => artifact.path === ".mcp-task/specs/sprint-005-agent-progress-engine.md")?.path ||
    workspace.artifacts.find((artifact) => artifact.path === ".mcp-task/specs/sprint-006-qa-evaluation-engine.md")?.path ||
    workspace.artifacts.find((artifact) => artifact.path === ".mcp-task/specs/sprint-007-explicit-tool-execution.md")?.path ||
    workspace.artifacts.find((artifact) => artifact.path === ".mcp-task/specs/sprint-008-local-memory-history.md")?.path ||
    workspace.artifacts.find((artifact) => artifact.path === ".mcp-task/tools/sprint-007-tool-execution.json")?.path ||
    workspace.artifacts.find((artifact) => artifact.path === ".mcp-task/qa/sprint-006-qa.json")?.path ||
    workspace.artifacts.find((artifact) => artifact.path === ".mcp-task/progress/sprint-005.json")?.path ||
    workspace.artifacts.find((artifact) => artifact.path === ".mcp-task/contracts/sprint-004-contract-gatekeeping.md")?.path ||
    workspace.artifacts.find((artifact) => artifact.path === ".mcp-task/sprints/sprint-003-spec-sprint-authoring.md")?.path ||
    workspace.roadmapPath ||
    workspace.artifacts[0].path
  );
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

loadWorkspace();
