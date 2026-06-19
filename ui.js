let actions = {};
let root;
let bottomNav;
let homeBack;

const VIEWS = [
  { id: "home", label: "Home", icon: "H" },
  { id: "workout", label: "Workout", icon: "W" },
  { id: "bodyweight", label: "Bodyweight", icon: "BW" },
  { id: "running", label: "Running", icon: "Run" },
  { id: "history", label: "History", icon: "Log" }
];

export function initUI(nextActions) {
  actions = nextActions;
  root = document.getElementById("app");
  bottomNav = document.getElementById("bottom-nav");
  homeBack = document.getElementById("home-back");

  bottomNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    actions.selectView(button.dataset.view);
  });
  homeBack.addEventListener("click", () => actions.selectView("home"));

  root.addEventListener("click", handleClick);
  root.addEventListener("submit", handleSubmit);
  root.addEventListener("change", handleChange);
  root.addEventListener("input", handleInput);
}

export function render(state) {
  const activeView = VIEWS.some((view) => view.id === state.activeView) ? state.activeView : "home";
  const template = state.templates.find((item) => Number(item.day) === Number(state.selectedDay));
  renderBottomNav(activeView);
  homeBack.hidden = activeView === "home";

  if (activeView === "home") root.innerHTML = renderHomeView(state);
  if (activeView === "workout") root.innerHTML = renderWorkoutView(state, template);
  if (activeView === "bodyweight") root.innerHTML = renderBodyweightView(state);
  if (activeView === "running") root.innerHTML = renderRunningView(state);
  if (activeView === "history") root.innerHTML = renderHistoryView(state);

  root.insertAdjacentHTML("beforeend", renderExerciseDatalist(state));
  drawBodyweightChart(state.bodyweight);
}

window.liftiUpdateRunDisplay = (tracker, options = {}) => {
  const distance = document.getElementById("run-distance-live");
  const duration = document.getElementById("run-duration-live");
  const pace = document.getElementById("run-pace-live");
  const points = document.getElementById("run-points-live");
  if (distance) distance.textContent = `${formatNumber(tracker.distance, 2)} mi`;
  if (duration) duration.textContent = formatDuration(tracker.durationSeconds);
  if (pace && options.paceChanged) pace.textContent = formatPace(tracker.averagePace);
  if (points) points.textContent = `${tracker.locations?.length || 0} points`;
};

function renderBottomNav(activeView) {
  bottomNav.innerHTML = VIEWS.map((view) => {
    const active = view.id === activeView ? " active" : "";
    return `<button class="dock-item${active}" type="button" data-view="${view.id}" aria-label="${view.label}">
      <span class="dock-icon">${view.icon}</span>
      <span class="dock-label">${view.label}</span>
    </button>`;
  }).join("");
}

function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action } = button.dataset;

  if (action === "select-day") actions.selectDay(button.dataset.day);
  if (action === "go-view") actions.selectView(button.dataset.view);
  if (action === "start-session") actions.startSession(button.dataset.templateId);
  if (action === "resume-session") document.getElementById("active-workout")?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (action === "discard-active" && confirm("Discard the active workout?")) actions.discardActive();
  if (action === "conflict-start") actions.discardActiveAndStart();
  if (action === "conflict-cancel") actions.cancelConflict();
  if (action === "finish-session") actions.finishSession();
  if (action === "remove-exercise" && confirm("Remove this exercise from the template?")) {
    actions.removeExercise(button.dataset.templateId, Number(button.dataset.exerciseIndex));
  }
  if (action === "add-set") actions.addSet(button.dataset.templateId, Number(button.dataset.exerciseIndex));
  if (action === "remove-set") {
    actions.removeSet(button.dataset.templateId, Number(button.dataset.exerciseIndex), Number(button.dataset.setIndex));
  }
  if (action === "delete-bodyweight" && confirm("Delete this bodyweight entry?")) actions.deleteBodyweight(button.dataset.id);
  if (action === "delete-run" && confirm("Delete this run?")) actions.deleteRun(button.dataset.id);
  if (action === "delete-history" && confirm(`Delete this ${button.dataset.type.toLowerCase()} history item?`)) {
    actions.deleteHistoryItem(button.dataset.type, button.dataset.id);
  }
  if (action === "history-toggle") actions.setOpenHistory(button.dataset.id);
  if (action === "start-run") actions.startRun(button.dataset.gps === "true");
  if (action === "finish-run") actions.finishRun();
  if (action === "discard-run" && confirm("Discard this run?")) actions.discardRun();
  if (action === "export-backup") actions.exportBackup();
  if (action === "import-trigger") root.querySelector("#import-file")?.click();
}

function handleSubmit(event) {
  const form = event.target.closest("form[data-action]");
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const action = form.dataset.action;

  if (action === "add-exercise") {
    actions.addExercise(data.templateId, data.exerciseName);
    form.reset();
  }
  if (action === "add-template-run") {
    actions.addTemplateRun(data);
    form.reset();
  }
  if (action === "add-session-run") {
    actions.addSessionRun(data);
    form.reset();
  }
  if (action === "add-bodyweight") {
    actions.addBodyweight(data.date, data.weight);
    form.reset();
  }
  if (action === "add-manual-run") {
    actions.addManualRun(data);
    form.reset();
  }
  if (action === "apply-531") {
    data.warmups = form.elements.warmups.checked;
    data.firstSetLast = form.elements.firstSetLast.checked;
    actions.apply531(data);
  }
  if (action === "apply-stronglifts") actions.applyStrongLifts(data);
}

function handleChange(event) {
  const input = event.target;
  const bind = input.dataset.bind;
  if (!bind) return;

  if (bind === "template-name") actions.updateTemplateName(input.dataset.templateId, input.value);
  if (bind === "exercise-name") actions.updateExerciseName(input.dataset.templateId, Number(input.dataset.exerciseIndex), input.value);
  if (bind === "template-set") {
    actions.updateTemplateSet(
      input.dataset.templateId,
      Number(input.dataset.exerciseIndex),
      Number(input.dataset.setIndex),
      input.dataset.field,
      input.type === "checkbox" ? input.checked : input.value
    );
  }
  if (bind === "bodyweight") actions.updateBodyweight(input.dataset.id, input.dataset.field, input.value);
  if (bind === "import-file") {
    if (input.files?.[0] && confirm("Importing overwrites the local Lifti database. Continue?")) {
      actions.importBackup(input.files[0]);
    }
    input.value = "";
  }
}

function handleInput(event) {
  const input = event.target;
  const bind = input.dataset.bind;
  if (bind === "session-set") {
    actions.updateSessionSet(
      Number(input.dataset.exerciseIndex),
      Number(input.dataset.setIndex),
      input.dataset.field,
      input.type === "checkbox" ? input.checked : input.value
    );
  }
  if (bind === "run-tracker") actions.updateRunTracker(input.dataset.field, input.value);
}

function renderHomeView(state) {
  const currentWeight = state.bodyweight[0];
  const lastWorkout = state.sessions.find((session) => session.status === "finished");
  const lastRun = state.runs[0];

  return `<section class="screen">
    <div class="section-head">
      <div>
        <div class="section-kicker">Home</div>
        <h2>Overview</h2>
        <p>Your latest training, running, and bodyweight status.</p>
      </div>
    </div>
    <div class="stack">
      <button class="home-card" type="button" data-action="go-view" data-view="bodyweight">
        <span class="metric-label">Current Bodyweight</span>
        <span class="home-value">${currentWeight ? `${formatNumber(currentWeight.weight, 1)} lb` : "None"}</span>
        <span class="row-subtitle">${currentWeight ? formatDate(currentWeight.date) : "Add an entry"}</span>
      </button>
      <button class="home-card" type="button" data-action="go-view" data-view="workout">
        <span class="metric-label">Last Workout</span>
        <span class="home-value">${lastWorkout ? escapeHtml(lastWorkout.templateName) : "None"}</span>
        <span class="row-subtitle">${lastWorkout ? `${formatDate(lastWorkout.endedAt || lastWorkout.startedAt)} - ${formatDuration(lastWorkout.durationSeconds || 0)}` : "Start a workout"}</span>
      </button>
      <button class="home-card" type="button" data-action="go-view" data-view="running">
        <span class="metric-label">Last Run Distance</span>
        <span class="home-value">${lastRun ? `${formatNumber(lastRun.distance, 2)} mi` : "None"}</span>
        <span class="row-subtitle">${lastRun ? `${formatDate(lastRun.startTime)} - ${formatPace(lastRun.averagePace)}` : "Log a run"}</span>
      </button>
      <div class="button-row">
        <button class="btn primary" type="button" data-action="go-view" data-view="workout">Workout</button>
        <button class="btn" type="button" data-action="go-view" data-view="bodyweight">Bodyweight</button>
        <button class="btn" type="button" data-action="go-view" data-view="running">Running</button>
      </div>
    </div>
  </section>`;
}

function renderWorkoutView(state, template) {
  if (state.activeSession) {
    return `<section class="screen">
      <div class="section-head">
        <div>
          <div class="section-kicker">Workout</div>
          <h2>Active Workout</h2>
          <p>Log sets here. The template returns after this workout is saved or discarded.</p>
        </div>
      </div>
      ${renderConflict(state)}
      ${renderActiveSession(state)}
    </section>`;
  }

  return `<section class="screen">
    <div class="section-head">
      <div>
        <div class="section-kicker">Workout</div>
        <h2>${template ? escapeHtml(template.name) : "Select a Day"}</h2>
        <p>Pick a training day, edit its template, and run one active workout at a time.</p>
      </div>
    </div>
    ${renderDaySelector(state)}
    ${renderWorkoutDashboard(state, template)}
    ${renderConflict(state)}
    ${renderActiveSession(state)}
    ${renderTemplateEditor(state, template)}
    ${renderPrograms(state)}
  </section>`;
}

function renderDaySelector(state) {
  return `<div class="day-strip" aria-label="Workout day selector">
    ${Array.from({ length: 7 }, (_, index) => {
      const day = index + 1;
      const active = Number(state.selectedDay) === day ? " active" : "";
      return `<button class="day-pill${active}" type="button" data-action="select-day" data-day="${day}">Day ${day}</button>`;
    }).join("")}
  </div>`;
}

function renderWorkoutDashboard(state, template) {
  const active = state.activeSession;
  const program = template?.programMeta?.program || state.settings.program || "Custom";
  const cycle = template?.programMeta?.cycle || state.settings.cycle;
  const week = template?.programMeta?.week || state.settings.week;
  const selectedActive = active && active.templateId === template?.id;
  const buttonText = active ? (selectedActive ? "Resume Workout" : "Active Workout Running") : "Start Workout";
  const buttonAction = selectedActive ? "resume-session" : "start-session";

  return `<div class="card stack">
    <div>
      <div class="template-title">${escapeHtml(template?.name || "No template")}</div>
      <div class="meta-row">
        <span>Day ${escapeHtml(state.selectedDay)}</span>
        <span>${escapeHtml(program)}</span>
        ${cycle ? `<span>Cycle ${escapeHtml(cycle)}</span>` : ""}
        ${week ? `<span>Week ${escapeHtml(week)}</span>` : ""}
      </div>
    </div>
    <div class="button-row">
      <button class="btn primary" type="button" data-action="${buttonAction}" data-template-id="${escapeAttr(template?.id || "")}">${buttonText}</button>
      ${active ? `<button class="btn danger" type="button" data-action="discard-active">Discard Active</button>` : ""}
    </div>
  </div>`;
}

function renderConflict(state) {
  if (!state.sessionConflict || !state.activeSession) return "";
  return `<div class="session-banner conflict">
    <div>
      <div class="row-title">One workout is already active</div>
      <div class="row-subtitle">${escapeHtml(state.activeSession.templateName)}</div>
    </div>
    <div class="button-row">
      <button class="btn danger" type="button" data-action="conflict-start">Discard and Start</button>
      <button class="btn" type="button" data-action="conflict-cancel">Cancel</button>
    </div>
  </div>`;
}

function renderActiveSession(state) {
  const session = state.activeSession;
  if (!session) return "";
  return `<div class="stack" id="active-workout">
    <div class="section-head inner-head">
      <div>
        <div class="section-kicker">Active</div>
        <h2>${escapeHtml(session.templateName)}</h2>
      </div>
      <span class="pill blue">${formatDuration(elapsedSeconds(session.startedAt))}</span>
    </div>
    ${(session.exercises || []).map((exercise, exerciseIndex) => renderSessionExercise(exercise, exerciseIndex)).join("")}
    ${renderAddSessionRunForm()}
    <div class="card compact">
      <div class="button-row">
        <button class="btn primary" type="button" data-action="finish-session">Save Workout</button>
        <button class="btn danger" type="button" data-action="discard-active">Discard</button>
      </div>
    </div>
  </div>`;
}

function renderAddSessionRunForm() {
  return `<form class="card compact stack" data-action="add-session-run">
    <div class="row-title">Add Run</div>
    <label class="field">
      <span class="field-label">Name</span>
      <input class="input" name="runName" list="exercise-library" placeholder="Easy Run">
    </label>
    <div class="two-col">
      <label class="field"><span class="field-label">Distance (mi)</span><input class="input" type="number" step="0.01" name="distance" placeholder="Optional"></label>
      <label class="field"><span class="field-label">Time</span><input class="input" name="duration" placeholder="Optional, e.g. 30:00"></label>
    </div>
    <button class="btn" type="submit">Add Run</button>
  </form>`;
}

function renderSessionExercise(exercise, exerciseIndex) {
  if (isRunExercise(exercise)) return renderSessionRun(exercise, exerciseIndex);
  return `<div class="exercise">
    <div class="exercise-head">
      <div class="row-title">${escapeHtml(exercise.name)}</div>
    </div>
    <div class="set-grid session head">
      <div>Target</div><div>Weight</div><div>Reps</div><div>Done</div>
    </div>
    ${(exercise.sets || []).map((set, setIndex) => `<div class="session-set">
      <div class="set-grid session">
        <div class="set-target">${formatNumber(set.targetWeight)} x ${escapeHtml(set.targetReps)}${set.amrap ? "+" : ""}</div>
        <input class="input" type="number" inputmode="decimal" data-bind="session-set" data-field="actualWeight" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" value="${escapeAttr(set.actualWeight)}" aria-label="Actual weight">
        <input class="input" type="number" inputmode="numeric" data-bind="session-set" data-field="actualReps" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" value="${escapeAttr(set.actualReps)}" aria-label="Actual reps">
        <input class="check" type="checkbox" data-bind="session-set" data-field="completed" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" ${set.completed ? "checked" : ""} aria-label="Completed">
      </div>
      <details class="set-notes" ${set.notes ? "open" : ""}>
        <summary>Notes</summary>
        <textarea class="input" data-bind="session-set" data-field="notes" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" placeholder="Set notes">${escapeHtml(set.notes || "")}</textarea>
      </details>
    </div>`).join("")}
  </div>`;
}

function renderSessionRun(exercise, exerciseIndex) {
  return `<div class="exercise run-exercise">
    <div class="exercise-head">
      <div class="row-title">${escapeHtml(exercise.name)}</div>
      <span class="pill blue">Run</span>
    </div>
    <div class="set-grid session run head">
      <div>Target</div><div>Distance</div><div>Time</div><div>Done</div>
    </div>
    ${(exercise.sets || []).map((set, setIndex) => `<div class="session-set">
      <div class="set-grid session run">
        <div class="set-target">${formatRunTarget(set)}</div>
        <input class="input" type="number" step="0.01" inputmode="decimal" data-bind="session-set" data-field="actualDistance" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" value="${escapeAttr(formatDistanceInput(set.actualDistance))}" aria-label="Actual distance">
        <input class="input" data-bind="session-set" data-field="actualDurationSeconds" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" value="${escapeAttr(formatDurationInput(set.actualDurationSeconds))}" placeholder="30:00" aria-label="Actual time">
        <input class="check" type="checkbox" data-bind="session-set" data-field="completed" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" ${set.completed ? "checked" : ""} aria-label="Completed">
      </div>
      <details class="set-notes" ${set.notes ? "open" : ""}>
        <summary>Notes</summary>
        <textarea class="input" data-bind="session-set" data-field="notes" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" placeholder="Run notes">${escapeHtml(set.notes || "")}</textarea>
      </details>
    </div>`).join("")}
  </div>`;
}

function renderTemplateEditor(state, template) {
  if (!template) return "";
  return `<details class="details-panel" open>
    <summary>
      <div>
        <div class="section-kicker">Template</div>
        <div class="row-title">Day ${escapeHtml(template.day)}</div>
      </div>
      <span class="chevron">Open</span>
    </summary>
    <div class="details-content stack">
      <div class="card compact">
        <label class="field">
          <span class="field-label">Name</span>
          <input class="inline-input template-title" data-bind="template-name" data-template-id="${escapeAttr(template.id)}" value="${escapeAttr(template.name)}">
        </label>
      </div>
      ${(template.exercises || []).map((exercise, exerciseIndex) => renderTemplateExercise(template, exercise, exerciseIndex)).join("")}
      <form class="card compact stack" data-action="add-exercise">
        <input type="hidden" name="templateId" value="${escapeAttr(template.id)}">
        <label class="field">
          <span class="field-label">Add Exercise</span>
          <input class="input" name="exerciseName" list="exercise-library" placeholder="Exercise name">
        </label>
        <button class="btn" type="submit">Add</button>
      </form>
      <form class="card compact stack" data-action="add-template-run">
        <input type="hidden" name="templateId" value="${escapeAttr(template.id)}">
        <div class="row-title">Add Run</div>
        <label class="field">
          <span class="field-label">Name</span>
          <input class="input" name="runName" list="exercise-library" placeholder="Easy Run">
        </label>
        <div class="two-col">
          <label class="field"><span class="field-label">Distance (mi)</span><input class="input" type="number" step="0.01" name="distance" placeholder="Optional"></label>
          <label class="field"><span class="field-label">Time</span><input class="input" name="duration" placeholder="Optional, e.g. 30:00"></label>
        </div>
        <button class="btn" type="submit">Add Run</button>
      </form>
    </div>
  </details>`;
}

function renderTemplateExercise(template, exercise, exerciseIndex) {
  if (isRunExercise(exercise)) return renderTemplateRun(template, exercise, exerciseIndex);
  return `<div class="exercise">
    <div class="exercise-head">
      <input class="inline-input" data-bind="exercise-name" data-template-id="${escapeAttr(template.id)}" data-exercise-index="${exerciseIndex}" value="${escapeAttr(exercise.name)}" list="exercise-library" aria-label="Exercise name">
      <button class="btn icon danger" type="button" data-action="remove-exercise" data-template-id="${escapeAttr(template.id)}" data-exercise-index="${exerciseIndex}" aria-label="Remove exercise">x</button>
    </div>
    <div class="set-grid head">
      <div>Weight</div><div>Reps</div><div>AMRAP</div><div></div>
    </div>
    ${(exercise.sets || []).map((set, setIndex) => `<div class="set-grid">
      <input class="input" type="number" inputmode="decimal" data-bind="template-set" data-template-id="${escapeAttr(template.id)}" data-field="targetWeight" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" value="${escapeAttr(set.targetWeight)}" aria-label="Target weight">
      <input class="input" type="number" inputmode="numeric" data-bind="template-set" data-template-id="${escapeAttr(template.id)}" data-field="targetReps" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" value="${escapeAttr(set.targetReps)}" aria-label="Target reps">
      <input class="check" type="checkbox" data-bind="template-set" data-template-id="${escapeAttr(template.id)}" data-field="amrap" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" ${set.amrap ? "checked" : ""} aria-label="AMRAP">
      <button class="btn icon" type="button" data-action="remove-set" data-template-id="${escapeAttr(template.id)}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" aria-label="Remove set">-</button>
    </div>`).join("")}
    <div class="button-row" style="padding:10px">
      <button class="btn sm" type="button" data-action="add-set" data-template-id="${escapeAttr(template.id)}" data-exercise-index="${exerciseIndex}">Add Set</button>
    </div>
  </div>`;
}

function renderTemplateRun(template, exercise, exerciseIndex) {
  return `<div class="exercise run-exercise">
    <div class="exercise-head">
      <input class="inline-input" data-bind="exercise-name" data-template-id="${escapeAttr(template.id)}" data-exercise-index="${exerciseIndex}" value="${escapeAttr(exercise.name)}" list="exercise-library" aria-label="Run name">
      <span class="pill blue">Run</span>
      <button class="btn icon danger" type="button" data-action="remove-exercise" data-template-id="${escapeAttr(template.id)}" data-exercise-index="${exerciseIndex}" aria-label="Remove run">x</button>
    </div>
    <div class="set-grid run head">
      <div>Distance</div><div>Time</div><div></div>
    </div>
    ${(exercise.sets || []).map((set, setIndex) => `<div class="set-grid run">
      <input class="input" type="number" step="0.01" inputmode="decimal" data-bind="template-set" data-template-id="${escapeAttr(template.id)}" data-field="targetDistance" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" value="${escapeAttr(formatDistanceInput(set.targetDistance))}" placeholder="Optional" aria-label="Target distance">
      <input class="input" data-bind="template-set" data-template-id="${escapeAttr(template.id)}" data-field="targetDurationSeconds" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" value="${escapeAttr(formatDurationInput(set.targetDurationSeconds))}" placeholder="Optional" aria-label="Target time">
      <button class="btn icon" type="button" data-action="remove-set" data-template-id="${escapeAttr(template.id)}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" aria-label="Remove run target">-</button>
    </div>`).join("")}
    <div class="button-row" style="padding:10px">
      <button class="btn sm" type="button" data-action="add-set" data-template-id="${escapeAttr(template.id)}" data-exercise-index="${exerciseIndex}">Add Run Target</button>
    </div>
  </div>`;
}

function renderBodyweightView(state) {
  const current = state.bodyweight[0];
  const trend7 = weightTrend(state.bodyweight, 7);
  const trend30 = weightTrend(state.bodyweight, 30);
  const today = new Date().toISOString().slice(0, 10);
  return `<section class="screen">
    <div class="section-head">
      <div>
        <div class="section-kicker">Bodyweight</div>
        <h2>${current ? `${formatNumber(current.weight, 1)} lb` : "No Entries"}</h2>
        <p>Track bodyweight locally with editable entries and trend charting.</p>
      </div>
    </div>
    <div class="stack">
      <div class="metric-grid">
        <div class="metric"><div class="metric-label">Current</div><div class="metric-value">${current ? `${formatNumber(current.weight, 1)} lb` : "None"}</div></div>
        <div class="metric"><div class="metric-label">7 Day</div><div class="metric-value">${formatTrend(trend7)}</div></div>
        <div class="metric"><div class="metric-label">30 Day</div><div class="metric-value">${formatTrend(trend30)}</div></div>
      </div>
      <div class="chart-wrap"><canvas id="bodyweight-chart" width="720" height="260" aria-label="Bodyweight chart"></canvas></div>
      <form class="card compact stack" data-action="add-bodyweight">
        <label class="field"><span class="field-label">Date</span><input class="input" type="date" name="date" value="${today}"></label>
        <label class="field"><span class="field-label">Weight</span><input class="input" type="number" step="0.1" inputmode="decimal" name="weight" placeholder="192.4"></label>
        <button class="btn primary" type="submit">Save</button>
      </form>
      <div class="bodyweight-list">${state.bodyweight.length ? state.bodyweight.map(renderBodyweightRow).join("") : `<div class="empty">No bodyweight entries.</div>`}</div>
    </div>
  </section>`;
}

function renderBodyweightRow(item) {
  return `<div class="list-row">
    <div class="stack tight">
      <input class="input" type="date" data-bind="bodyweight" data-field="date" data-id="${escapeAttr(item.id)}" value="${escapeAttr(item.date)}">
      <input class="input" type="number" step="0.1" data-bind="bodyweight" data-field="weight" data-id="${escapeAttr(item.id)}" value="${escapeAttr(item.weight)}">
    </div>
    <button class="btn icon danger" type="button" data-action="delete-bodyweight" data-id="${escapeAttr(item.id)}" aria-label="Delete bodyweight">x</button>
  </div>`;
}

function renderRunningView(state) {
  const tracker = state.runTracker;
  const today = new Date().toISOString().slice(0, 10);
  return `<section class="screen">
    <div class="section-head">
      <div>
        <div class="section-kicker">Running</div>
        <h2>${tracker?.active ? "Run In Progress" : "Run Tracker"}</h2>
        <p>Track a run with GPS when available, or log distance manually.</p>
      </div>
    </div>
    <div class="stack">
      ${tracker?.active ? renderRunTracker(tracker) : renderRunStart()}
      <form class="card compact stack" data-action="add-manual-run">
        <div class="row-title">Manual Run</div>
        <label class="field"><span class="field-label">Date</span><input class="input" type="date" name="date" value="${today}"></label>
        <label class="field"><span class="field-label">Distance</span><input class="input" type="number" step="0.01" name="distance" placeholder="3.10"></label>
        <label class="field"><span class="field-label">Duration</span><input class="input" name="duration" placeholder="28:45"></label>
        <label class="field"><span class="field-label">Notes</span><input class="input" name="notes" placeholder="Optional"></label>
        <button class="btn" type="submit">Add Run</button>
      </form>
      <div class="run-list">${state.runs.length ? state.runs.map(renderRunRow).join("") : `<div class="empty">No runs logged.</div>`}</div>
    </div>
  </section>`;
}

function renderRunStart() {
  return `<div class="card compact stack">
    <div class="button-row">
      <button class="btn primary" type="button" data-action="start-run" data-gps="true">Start GPS Run</button>
      <button class="btn" type="button" data-action="start-run" data-gps="false">Start Manual Run</button>
    </div>
    <div class="row-subtitle">GPS requires location permission and a secure browser context such as localhost or HTTPS.</div>
  </div>`;
}

function renderRunTracker(tracker) {
  return `<div class="card stack">
    <div class="run-live">
      <div><div class="metric-label">Distance</div><div class="big" id="run-distance-live">${formatNumber(tracker.distance, 2)} mi</div></div>
      <div><div class="metric-label">Time</div><div class="big" id="run-duration-live">${formatDuration(tracker.durationSeconds)}</div></div>
      <div><div class="metric-label">Pace</div><div class="big" id="run-pace-live">${formatPace(tracker.averagePace)}</div></div>
    </div>
    <div class="pill-row">
      <span class="pill ${tracker.gpsEnabled ? "blue" : ""}">${escapeHtml(tracker.gpsStatus || (tracker.gpsEnabled ? "GPS starting" : "Manual distance"))}</span>
      ${tracker.gpsEnabled ? `<span class="pill" id="run-points-live">${tracker.locations?.length || 0} points</span>` : ""}
    </div>
    ${tracker.gpsEnabled ? "" : `<label class="field"><span class="field-label">Distance</span><input class="input" type="number" step="0.01" data-bind="run-tracker" data-field="distance" value="${escapeAttr(tracker.distance || "")}"></label>`}
    ${tracker.error ? `<div class="pill danger">${escapeHtml(tracker.error)}</div>` : ""}
    <label class="field"><span class="field-label">Notes</span><input class="input" data-bind="run-tracker" data-field="notes" value="${escapeAttr(tracker.notes || "")}"></label>
    <div class="button-row">
      <button class="btn primary" type="button" data-action="finish-run">Finish</button>
      <button class="btn danger" type="button" data-action="discard-run">Discard</button>
    </div>
  </div>`;
}

function renderRunRow(run) {
  return `<div class="list-row">
    <div>
      <div class="row-title">${formatDate(run.startTime)} - ${formatNumber(run.distance, 2)} mi</div>
      <div class="row-subtitle">${formatDuration(run.durationSeconds)} - ${formatPace(run.averagePace)}${run.gpsEnabled ? " - GPS" : ""}</div>
      ${run.notes ? `<div class="row-subtitle">${escapeHtml(run.notes)}</div>` : ""}
    </div>
    <button class="btn icon danger" type="button" data-action="delete-run" data-id="${escapeAttr(run.id)}" aria-label="Delete run">x</button>
  </div>`;
}

function renderHistoryView(state) {
  const activity = buildActivityLog(state);
  return `<section class="screen">
    <div class="section-head">
      <div>
        <div class="section-kicker">History</div>
        <h2>Activity Log</h2>
        <p>Every workout, run, and bodyweight entry in one chronological log.</p>
      </div>
    </div>
    <div class="stack">
      ${renderStats(state)}
      <div class="history-list">
        ${activity.length ? activity.map((item) => renderActivityItem(item, state.openHistoryId === item.id)).join("") : `<div class="empty">No activity logged.</div>`}
      </div>
      ${renderBackup(state)}
    </div>
  </section>`;
}

function buildActivityLog(state) {
  const workouts = state.sessions.filter((session) => session.status === "finished").map((session) => ({
    id: session.id,
    type: "Workout",
    when: session.endedAt || session.startedAt,
    title: session.templateName,
    subtitle: `${formatDuration(session.durationSeconds || 0)} - ${session.prs?.length || 0} PR`,
    session
  }));
  const runs = state.runs.map((run) => ({
    id: run.id,
    type: "Run",
    when: run.endTime || run.startTime,
    title: `${formatNumber(run.distance, 2)} mi`,
    subtitle: `${formatDuration(run.durationSeconds)} - ${formatPace(run.averagePace)}${run.gpsEnabled ? " - GPS" : ""}`,
    run
  }));
  const bodyweight = state.bodyweight.map((entry) => ({
    id: entry.id,
    type: "Bodyweight",
    when: entry.date,
    title: `${formatNumber(entry.weight, 1)} lb`,
    subtitle: "Bodyweight entry",
    entry
  }));
  return [...workouts, ...runs, ...bodyweight].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
}

function renderActivityItem(item, open) {
  return `<div class="history-item">
    <div class="history-item-head">
      <button class="history-toggle" type="button" data-action="history-toggle" data-id="${escapeAttr(item.id)}">
        <div>
          <div class="meta-row"><span class="pill accent">${escapeHtml(item.type)}</span><span>${formatDate(item.when)}</span></div>
          <div class="row-title">${escapeHtml(item.title)}</div>
          <div class="row-subtitle">${escapeHtml(item.subtitle)}</div>
        </div>
        <span class="chevron">${open ? "Close" : "Open"}</span>
      </button>
      <button class="btn icon danger history-delete" type="button" data-action="delete-history" data-id="${escapeAttr(item.id)}" data-type="${escapeAttr(item.type)}" aria-label="Delete ${escapeAttr(item.type)} history item">x</button>
    </div>
    ${open ? renderActivityDetail(item) : ""}
  </div>`;
}

function renderActivityDetail(item) {
  if (item.session) {
    const session = item.session;
    return `<div class="history-detail stack">
      ${(session.exercises || []).map((exercise) => `<div>
        <div class="row-title">${escapeHtml(exercise.name)}</div>
        <div class="meta-row">${renderCompletedSessionSets(exercise)}</div>
      </div>`).join("")}
      ${session.prs?.length ? `<div class="pr-list">${session.prs.map(renderPR).join("")}</div>` : ""}
    </div>`;
  }
  if (item.run) {
    return `<div class="history-detail stack">
      <div class="meta-row">
        <span class="pill">${formatNumber(item.run.distance, 2)} mi</span>
        <span class="pill">${formatDuration(item.run.durationSeconds)}</span>
        <span class="pill">${formatPace(item.run.averagePace)}</span>
        ${item.run.gpsEnabled ? `<span class="pill blue">${item.run.locations?.length || 0} GPS points</span>` : ""}
      </div>
      ${item.run.notes ? `<div class="row-subtitle">${escapeHtml(item.run.notes)}</div>` : ""}
    </div>`;
  }
  return `<div class="history-detail"><span class="pill">${escapeHtml(item.title)}</span></div>`;
}

function renderCompletedSessionSets(exercise) {
  const completed = (exercise.sets || []).filter((set) => set.completed);
  if (!completed.length) return `<span class="muted">No completed sets</span>`;
  if (isRunExercise(exercise)) {
    return completed.map((set) => `<span class="pill blue">${formatRunResult(set)}</span>`).join("");
  }
  return completed.map((set) => `<span class="pill">${formatNumber(set.actualWeight)} x ${escapeHtml(set.actualReps)}</span>`).join("");
}

function renderPR(pr) {
  const value = pr.value ? ` - e1RM ${formatNumber(pr.value)}` : "";
  return `<div class="pr-item">${escapeHtml(pr.type)} - ${escapeHtml(pr.exercise)} - ${formatNumber(pr.weight)} x ${escapeHtml(pr.reps)}${value}</div>`;
}

function renderStats(state) {
  const stats = buildStats(state);
  return `<div class="metric-grid">
    <div class="metric"><div class="metric-label">Volume</div><div class="metric-value">${formatNumber(stats.volume)} lb</div></div>
    <div class="metric"><div class="metric-label">Run Total</div><div class="metric-value">${formatNumber(stats.runDistance, 2)} mi</div></div>
    <div class="metric"><div class="metric-label">Activity</div><div class="metric-value accent">${stats.activityCount}</div></div>
  </div>`;
}

function renderPrograms(state) {
  const s = state.settings;
  const tm = s.trainingMaxes || {};
  const sl = s.strongLifts || {};
  return `<details class="details-panel">
    <summary>
      <div>
        <div class="section-kicker">Programs</div>
        <div class="row-title">${escapeHtml(s.program || "Custom")}</div>
      </div>
      <span class="chevron">Open</span>
    </summary>
    <div class="details-content program-grid">
      <form class="card stack" data-action="apply-531">
        <div class="row-title">5/3/1</div>
        <label class="field"><span class="field-label">Cycle</span><input class="input" name="cycle" type="number" value="${escapeAttr(s.cycle || 1)}"></label>
        <label class="field"><span class="field-label">Week</span><select name="week">${[1, 2, 3, 4].map((week) => `<option value="${week}" ${Number(s.week) === week ? "selected" : ""}>${week}</option>`).join("")}</select></label>
        <label class="field"><span class="field-label">Increment</span><input class="input" name="increment" type="number" value="${escapeAttr(s.increment || 5)}"></label>
        <div class="tm-grid">
          <label class="field"><span class="field-label">Bench</span><input class="input" name="bench" type="number" value="${escapeAttr(tm["Bench Press"] || 0)}"></label>
          <label class="field"><span class="field-label">Squat</span><input class="input" name="squat" type="number" value="${escapeAttr(tm.Squat || 0)}"></label>
          <label class="field"><span class="field-label">Press</span><input class="input" name="press" type="number" value="${escapeAttr(tm.Press || 0)}"></label>
          <label class="field"><span class="field-label">Deadlift</span><input class="input" name="deadlift" type="number" value="${escapeAttr(tm.Deadlift || 0)}"></label>
        </div>
        <div class="pill-row">
          <label class="pill"><input type="checkbox" name="warmups" ${s.warmups ? "checked" : ""}> Warmups</label>
          <label class="pill"><input type="checkbox" name="firstSetLast" ${s.firstSetLast ? "checked" : ""}> 5x10 @ 50%</label>
        </div>
        <button class="btn primary" type="submit">Generate</button>
      </form>
      <form class="card stack" data-action="apply-stronglifts">
        <div class="row-title">StrongLifts 5x5</div>
        <div class="tm-grid">
          <label class="field"><span class="field-label">Squat</span><input class="input" name="squat" type="number" value="${escapeAttr(sl.Squat || 0)}"></label>
          <label class="field"><span class="field-label">Bench</span><input class="input" name="bench" type="number" value="${escapeAttr(sl["Bench Press"] || 0)}"></label>
          <label class="field"><span class="field-label">Row</span><input class="input" name="row" type="number" value="${escapeAttr(sl["DB Row"] || 0)}"></label>
          <label class="field"><span class="field-label">Press</span><input class="input" name="press" type="number" value="${escapeAttr(sl.Press || 0)}"></label>
          <label class="field"><span class="field-label">Deadlift</span><input class="input" name="deadlift" type="number" value="${escapeAttr(sl.Deadlift || 0)}"></label>
        </div>
        <button class="btn blue" type="submit">Generate</button>
      </form>
    </div>
  </details>`;
}

function renderBackup(state) {
  return `<div class="card compact stack">
    <div class="row-title">Import / Export</div>
    <div class="backup-row">
      <button class="btn primary" type="button" data-action="export-backup">Export JSON</button>
      <button class="btn" type="button" data-action="import-trigger">Import JSON</button>
      <input class="sr-only" id="import-file" type="file" accept="application/json,.json" data-bind="import-file">
    </div>
    ${state.exportMessage ? `<div class="pill accent">${escapeHtml(state.exportMessage)}</div>` : ""}
    ${state.importError ? `<div class="pill danger">${escapeHtml(state.importError)}</div>` : ""}
  </div>`;
}

function renderExerciseDatalist(state) {
  return `<datalist id="exercise-library">${state.exerciseLibrary.map((exercise) => `<option value="${escapeAttr(exercise.name)}"></option>`).join("")}</datalist>`;
}

function isRunExercise(exercise) {
  return exercise?.type === "run" || (exercise?.sets || []).some((set) => hasRunFields(set));
}

function hasRunFields(set) {
  return Boolean(set) && (
    "targetDistance" in set ||
    "targetDurationSeconds" in set ||
    "actualDistance" in set ||
    "actualDurationSeconds" in set
  );
}

function formatRunTarget(set) {
  const parts = [];
  const distance = Number(set.targetDistance) || 0;
  const duration = Number(set.targetDurationSeconds) || 0;
  if (distance > 0) parts.push(`${formatNumber(distance, 2)} mi`);
  if (duration > 0) parts.push(formatDuration(duration));
  return parts.join(" / ") || "Open run";
}

function formatRunResult(set) {
  const parts = [];
  const distance = Number(set.actualDistance) || Number(set.targetDistance) || 0;
  const duration = Number(set.actualDurationSeconds) || Number(set.targetDurationSeconds) || 0;
  if (distance > 0) parts.push(`${formatNumber(distance, 2)} mi`);
  if (duration > 0) parts.push(formatDuration(duration));
  return parts.join(" / ") || "Run";
}

function formatDistanceInput(value) {
  const distance = Number(value) || 0;
  return distance > 0 ? formatNumber(distance, 2) : "";
}

function formatDurationInput(seconds) {
  const duration = Number(seconds) || 0;
  return duration > 0 ? formatDuration(duration) : "";
}

function buildStats(state) {
  const finished = state.sessions.filter((session) => session.status === "finished");
  let volume = 0;

  finished.forEach((session) => {
    (session.exercises || []).forEach((exercise) => {
      if (isRunExercise(exercise)) return;
      (exercise.sets || []).filter((set) => set.completed).forEach((set) => {
        volume += (Number(set.actualWeight) || 0) * (Number(set.actualReps) || 0);
      });
    });
  });

  return {
    volume,
    runDistance: state.runs.reduce((sum, run) => sum + (Number(run.distance) || 0), 0) + sessionRunDistance(finished),
    activityCount: finished.length + state.runs.length + state.bodyweight.length
  };
}

function sessionRunDistance(sessions) {
  return sessions.reduce((total, session) => total + (session.exercises || []).reduce((exerciseTotal, exercise) => {
    if (!isRunExercise(exercise)) return exerciseTotal;
    return exerciseTotal + (exercise.sets || [])
      .filter((set) => set.completed)
      .reduce((setTotal, set) => setTotal + (Number(set.actualDistance) || Number(set.targetDistance) || 0), 0);
  }, 0), 0);
}

function drawBodyweightChart(items) {
  const canvas = document.getElementById("bodyweight-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const data = [...items].sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-30);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0F1518";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(230,241,241,.08)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = i * canvas.height / 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  if (data.length < 2) {
    ctx.fillStyle = "#94A3A3";
    ctx.font = "18px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Add two entries for a trend", canvas.width / 2, canvas.height / 2);
    return;
  }
  const weights = data.map((item) => Number(item.weight));
  const min = Math.min(...weights) - 2;
  const max = Math.max(...weights) + 2;
  const x = (index) => 28 + index * ((canvas.width - 56) / Math.max(1, data.length - 1));
  const y = (weight) => canvas.height - 26 - ((weight - min) / Math.max(1, max - min)) * (canvas.height - 52);
  ctx.strokeStyle = "#2DD4BF";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  data.forEach((item, index) => {
    const px = x(index);
    const py = y(Number(item.weight));
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.fillStyle = "#38BDF8";
  data.forEach((item, index) => {
    ctx.beginPath();
    ctx.arc(x(index), y(Number(item.weight)), 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function weightTrend(items, days) {
  if (items.length < 2) return null;
  const latest = items[0];
  const latestTime = new Date(latest.date).getTime();
  const cutoff = latestTime - days * 24 * 60 * 60 * 1000;
  const previous = [...items].reverse().find((item) => new Date(item.date).getTime() >= cutoff && item.id !== latest.id);
  if (!previous) return null;
  return Number(latest.weight) - Number(previous.weight);
}

function formatTrend(value) {
  if (value === null || !Number.isFinite(value)) return "None";
  if (value === 0) return "0.0 lb";
  return `${value > 0 ? "+" : ""}${formatNumber(value, 1)} lb`;
}

function formatNumber(value, digits = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0";
  return parsed.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs) return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatPace(secondsPerMile) {
  const pace = Number(secondsPerMile) || 0;
  return pace > 0 ? `${formatDuration(pace)} /mi` : "--";
}

function elapsedSeconds(startedAt) {
  return Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
