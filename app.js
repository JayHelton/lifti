import {
  bulkPut,
  clearStore,
  exportAllData,
  getAll,
  getSetting,
  importAllData,
  put,
  remove,
  seedDefaultsIfNeeded,
  setSetting
} from "./db.js";
import {
  DEFAULT_SETTINGS,
  defaultSeedData,
  detectPRs,
  generate531Templates,
  generateStrongLiftsTemplates
} from "./programs.js";
import { initUI, render } from "./ui.js";

const VALID_VIEWS = ["home", "workout", "bodyweight", "running", "history"];
const PACE_UPDATE_MS = 15000;

const state = {
  activeView: initialView(),
  selectedDay: Number(localStorage.getItem("lifti:selectedDay")) || 1,
  templates: [],
  sessions: [],
  activeSession: null,
  exerciseLibrary: [],
  bodyweight: [],
  runs: [],
  settings: structuredClone(DEFAULT_SETTINGS),
  sessionConflict: null,
  openHistoryId: null,
  runTracker: null,
  importError: "",
  exportMessage: ""
};

let runInterval = null;
let watchId = null;
let deferredInstallPrompt = null;

function initialView() {
  const fromHash = window.location.hash.replace("#", "");
  if (VALID_VIEWS.includes(fromHash)) return fromHash;
  const saved = localStorage.getItem("lifti:activeView");
  return VALID_VIEWS.includes(saved) ? saved : "home";
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clone(value) {
  return structuredClone(value);
}

function sortByDateDesc(items, field) {
  return [...items].sort((a, b) => String(b[field] || "").localeCompare(String(a[field] || "")));
}

function selectedTemplate() {
  return state.templates.find((template) => Number(template.day) === Number(state.selectedDay));
}

function templateById(id) {
  return state.templates.find((template) => template.id === id);
}

function activeSessionFrom(sessions) {
  return sessions.find((session) => session.status === "active") || null;
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function durationFromText(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  if (raw.includes(":")) {
    const parts = raw.split(":").map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part))) return 0;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  const minutes = Number(raw);
  return Number.isFinite(minutes) ? Math.round(minutes * 60) : 0;
}

function runSetFromData(data = {}) {
  return {
    targetDistance: parseNumber(data.distance),
    targetDurationSeconds: durationFromText(data.duration)
  };
}

function runExerciseFromData(data = {}, { session = false } = {}) {
  const set = runSetFromData(data);
  const exercise = {
    name: String(data.name || data.runName || "Run").trim() || "Run",
    type: "run",
    sets: [set]
  };
  if (session) {
    exercise.sets = exercise.sets.map((item) => ({
      ...item,
      actualDistance: Number(item.targetDistance) || 0,
      actualDurationSeconds: Number(item.targetDurationSeconds) || 0,
      completed: false,
      notes: ""
    }));
  }
  return exercise;
}

function hasRunFields(set) {
  return Boolean(set) && (
    "targetDistance" in set ||
    "targetDurationSeconds" in set ||
    "actualDistance" in set ||
    "actualDurationSeconds" in set
  );
}

function isRunExercise(exercise) {
  return exercise?.type === "run" || (exercise?.sets || []).some((set) => hasRunFields(set));
}

function distanceMiles(a, b) {
  const radiusMiles = 3958.8;
  const toRad = (degrees) => degrees * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusMiles * Math.asin(Math.sqrt(x));
}

function sessionDuration(session) {
  const start = new Date(session.startedAt).getTime();
  const end = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
  return Math.max(0, Math.round((end - start) / 1000));
}

async function loadData() {
  state.templates = (await getAll("templates")).sort((a, b) => Number(a.day) - Number(b.day));
  state.sessions = sortByDateDesc(await getAll("sessions"), "startedAt");
  state.activeSession = activeSessionFrom(state.sessions);
  state.exerciseLibrary = (await getAll("exerciseLibrary")).sort((a, b) => a.name.localeCompare(b.name));
  state.bodyweight = sortByDateDesc(await getAll("bodyweight"), "date");
  state.runs = sortByDateDesc(await getAll("runs"), "startTime");
  state.settings = await getSetting("preferences", structuredClone(DEFAULT_SETTINGS));

  if (state.templates.length < 7) {
    const generated = generate531Templates(state.settings);
    await clearStore("templates");
    await bulkPut("templates", generated);
    state.templates = generated;
  }
}

function renderState() {
  render(state);
}

async function selectView(view) {
  state.activeView = view;
  localStorage.setItem("lifti:activeView", view);
  if (window.location.hash !== `#${view}`) {
    window.history.replaceState(null, "", `#${view}`);
  }
  renderState();
}

async function rememberExercise(name) {
  const clean = String(name || "").trim();
  if (!clean) return;
  if (state.exerciseLibrary.some((exercise) => exercise.name.toLowerCase() === clean.toLowerCase())) return;
  const record = { name: clean, createdAt: new Date().toISOString() };
  state.exerciseLibrary.push(record);
  state.exerciseLibrary.sort((a, b) => a.name.localeCompare(b.name));
  await put("exerciseLibrary", record);
}

async function saveTemplate(template, shouldRender = true) {
  await put("templates", clone(template));
  if (shouldRender) renderState();
}

function sessionFromTemplate(template) {
  return {
    id: uid("session"),
    templateId: template.id,
    templateDay: template.day,
    templateName: template.name,
    status: "active",
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationSeconds: 0,
    prs: [],
    exercises: (template.exercises || []).map((exercise) => {
      const isRun = isRunExercise(exercise);
      return {
        name: exercise.name,
        ...(isRun ? { type: "run" } : {}),
        sets: (exercise.sets || []).map((set) => isRun ? ({
          targetDistance: Number(set.targetDistance) || 0,
          actualDistance: Number(set.targetDistance) || 0,
          targetDurationSeconds: Number(set.targetDurationSeconds) || 0,
          actualDurationSeconds: Number(set.targetDurationSeconds) || 0,
          completed: false,
          notes: ""
        }) : ({
          targetWeight: Number(set.targetWeight) || 0,
          actualWeight: Number(set.targetWeight) || 0,
          targetReps: Number(set.targetReps) || 0,
          actualReps: Number(set.targetReps) || 0,
          amrap: Boolean(set.amrap),
          completed: false,
          notes: ""
        }))
      };
    })
  };
}

async function selectDay(day) {
  state.selectedDay = Number(day);
  localStorage.setItem("lifti:selectedDay", String(state.selectedDay));
  renderState();
}

async function updateTemplateName(templateId, value) {
  const template = templateById(templateId);
  if (!template) return;
  template.name = String(value || "").trim() || `Day ${template.day}`;
  await saveTemplate(template);
}

async function updateExerciseName(templateId, exerciseIndex, value) {
  const template = templateById(templateId);
  if (!template || !template.exercises[exerciseIndex]) return;
  const name = String(value || "").trim();
  if (!name) return;
  template.exercises[exerciseIndex].name = name;
  await rememberExercise(name);
  await saveTemplate(template);
}

async function addExercise(templateId, name) {
  const template = templateById(templateId);
  const clean = String(name || "").trim();
  if (!template || !clean) return;
  template.exercises.push({
    name: clean,
    sets: [{ targetWeight: 0, targetReps: 10, amrap: false }]
  });
  await rememberExercise(clean);
  await saveTemplate(template);
}

async function addTemplateRun(data) {
  const template = templateById(data.templateId);
  if (!template) return;
  const exercise = runExerciseFromData(data);
  template.exercises.push(exercise);
  await rememberExercise(exercise.name);
  await saveTemplate(template);
}

async function removeExercise(templateId, exerciseIndex) {
  const template = templateById(templateId);
  if (!template) return;
  template.exercises.splice(Number(exerciseIndex), 1);
  await saveTemplate(template);
}

async function addSet(templateId, exerciseIndex) {
  const template = templateById(templateId);
  const exercise = template?.exercises?.[exerciseIndex];
  if (!exercise) return;
  if (!Array.isArray(exercise.sets)) exercise.sets = [];
  const fallback = isRunExercise(exercise) ? { targetDistance: 0, targetDurationSeconds: 0 } : { targetWeight: 0, targetReps: 10, amrap: false };
  const lastSet = exercise.sets[exercise.sets.length - 1] || fallback;
  exercise.sets.push(clone(lastSet));
  await saveTemplate(template);
}

async function removeSet(templateId, exerciseIndex, setIndex) {
  const template = templateById(templateId);
  const exercise = template?.exercises?.[exerciseIndex];
  if (!exercise) return;
  if (!Array.isArray(exercise.sets)) exercise.sets = [];
  exercise.sets.splice(Number(setIndex), 1);
  if (!exercise.sets.length) {
    exercise.sets.push(isRunExercise(exercise) ? { targetDistance: 0, targetDurationSeconds: 0 } : { targetWeight: 0, targetReps: 10, amrap: false });
  }
  await saveTemplate(template);
}

async function updateTemplateSet(templateId, exerciseIndex, setIndex, field, value) {
  const template = templateById(templateId);
  const set = template?.exercises?.[exerciseIndex]?.sets?.[setIndex];
  if (!set) return;
  if (field === "amrap") set.amrap = Boolean(value);
  if (field === "targetWeight") set.targetWeight = parseNumber(value);
  if (field === "targetReps") set.targetReps = parseNumber(value);
  if (field === "targetDistance") set.targetDistance = parseNumber(value);
  if (field === "targetDurationSeconds") set.targetDurationSeconds = durationFromText(value);
  await saveTemplate(template);
}

async function startSession(templateId) {
  const template = templateById(templateId);
  if (!template) return;
  if (state.activeSession) {
    if (state.activeSession.templateId === templateId) {
      state.sessionConflict = null;
      renderState();
      return;
    }
    state.sessionConflict = { templateId };
    renderState();
    return;
  }
  const session = sessionFromTemplate(template);
  await put("sessions", session);
  state.activeSession = session;
  state.sessionConflict = null;
  await loadData();
  renderState();
}

async function discardActive(shouldRender = true) {
  if (!state.activeSession) return;
  await remove("sessions", state.activeSession.id);
  state.activeSession = null;
  state.sessionConflict = null;
  await loadData();
  if (shouldRender) renderState();
}

async function discardActiveAndStart() {
  const nextTemplateId = state.sessionConflict?.templateId;
  await discardActive(false);
  if (nextTemplateId) await startSession(nextTemplateId);
}

async function cancelConflict() {
  state.sessionConflict = null;
  renderState();
}

async function updateSessionSet(exerciseIndex, setIndex, field, value) {
  const set = state.activeSession?.exercises?.[exerciseIndex]?.sets?.[setIndex];
  if (!set) return;
  if (field === "actualWeight") set.actualWeight = parseNumber(value);
  if (field === "actualReps") set.actualReps = parseNumber(value);
  if (field === "actualDistance") set.actualDistance = parseNumber(value);
  if (field === "actualDurationSeconds") set.actualDurationSeconds = durationFromText(value);
  if (field === "completed") set.completed = Boolean(value);
  if (field === "notes") set.notes = String(value || "");
  state.activeSession.durationSeconds = sessionDuration(state.activeSession);
  await put("sessions", clone(state.activeSession));
}

async function addSessionRun(data) {
  if (!state.activeSession) return;
  const exercise = runExerciseFromData(data, { session: true });
  state.activeSession.exercises.push(exercise);
  await rememberExercise(exercise.name);
  state.activeSession.durationSeconds = sessionDuration(state.activeSession);
  await put("sessions", clone(state.activeSession));
  renderState();
}

async function finishSession() {
  if (!state.activeSession) return;
  const finished = clone(state.activeSession);
  finished.status = "finished";
  finished.endedAt = new Date().toISOString();
  finished.durationSeconds = sessionDuration(finished);
  finished.prs = detectPRs(finished, state.sessions.filter((session) => session.id !== finished.id));
  await put("sessions", finished);
  state.activeSession = null;
  state.openHistoryId = finished.id;
  await loadData();
  renderState();
}

async function addBodyweight(date, weight) {
  const parsed = parseNumber(weight);
  if (!parsed) return;
  await put("bodyweight", {
    id: uid("bw"),
    date: date || new Date().toISOString().slice(0, 10),
    weight: parsed,
    createdAt: new Date().toISOString()
  });
  await loadData();
  renderState();
}

async function updateBodyweight(id, field, value) {
  const record = state.bodyweight.find((item) => item.id === id);
  if (!record) return;
  if (field === "date") record.date = value;
  if (field === "weight") record.weight = parseNumber(value, record.weight);
  await put("bodyweight", clone(record));
  await loadData();
  renderState();
}

async function deleteBodyweight(id) {
  await remove("bodyweight", id);
  await loadData();
  renderState();
}

async function addManualRun(data) {
  const distance = parseNumber(data.distance);
  const durationSeconds = durationFromText(data.duration);
  if (!distance || !durationSeconds) return;
  const start = new Date(data.date || new Date().toISOString().slice(0, 10));
  await put("runs", {
    id: uid("run"),
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + durationSeconds * 1000).toISOString(),
    distance,
    durationSeconds,
    averagePace: durationSeconds / distance,
    gpsEnabled: false,
    locations: [],
    notes: String(data.notes || "")
  });
  await loadData();
  renderState();
}

async function deleteRun(id) {
  await remove("runs", id);
  await loadData();
  renderState();
}

async function deleteHistoryItem(type, id) {
  const storesByType = {
    Workout: "sessions",
    Run: "runs",
    Bodyweight: "bodyweight"
  };
  const storeName = storesByType[type];
  if (!storeName || !id) return;

  await remove(storeName, id);
  if (state.openHistoryId === id) state.openHistoryId = null;
  await loadData();
  renderState();
}

function stopRunTimers() {
  if (runInterval) clearInterval(runInterval);
  runInterval = null;
  if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

function paceForTracker(tracker) {
  return tracker.distance > 0 ? tracker.durationSeconds / tracker.distance : 0;
}

function refreshRunTracker({ forcePace = false } = {}) {
  if (!state.runTracker?.active) return;
  const now = Date.now();
  state.runTracker.durationSeconds = Math.round((Date.now() - new Date(state.runTracker.startTime).getTime()) / 1000);
  const paceDue = now - (state.runTracker.lastPaceUpdatedAt || 0) >= PACE_UPDATE_MS;
  const paceChanged = forcePace || paceDue;
  if (paceChanged) {
    state.runTracker.averagePace = paceForTracker(state.runTracker);
    state.runTracker.lastPaceUpdatedAt = now;
  }
  if (typeof window.liftiUpdateRunDisplay === "function") {
    window.liftiUpdateRunDisplay(state.runTracker, { paceChanged });
  }
}

async function startRun(gpsEnabled) {
  if (state.runTracker?.active) return;
  state.runTracker = {
    active: true,
    startTime: new Date().toISOString(),
    gpsEnabled: Boolean(gpsEnabled),
    locations: [],
    distance: 0,
    durationSeconds: 0,
    averagePace: 0,
    lastPaceUpdatedAt: Date.now(),
    notes: "",
    error: "",
    gpsStatus: gpsEnabled ? "Starting GPS..." : "Manual distance"
  };

  if (gpsEnabled && !window.isSecureContext) {
    state.runTracker.error = "GPS needs HTTPS or localhost.";
    state.runTracker.gpsStatus = "GPS unavailable";
  } else if (gpsEnabled && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!state.runTracker?.active) return;
        const point = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date(position.timestamp).toISOString()
        };
        state.runTracker.locations.push(point);
        state.runTracker.gpsStatus = "GPS locked";
        renderState();
      },
      (error) => {
        if (!state.runTracker?.active) return;
        state.runTracker.error = error.message || "GPS unavailable";
        state.runTracker.gpsStatus = "GPS unavailable";
        renderState();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!state.runTracker?.active) return;
        const point = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date(position.timestamp).toISOString()
        };
        const previous = state.runTracker.locations[state.runTracker.locations.length - 1];
        state.runTracker.locations.push(point);
        state.runTracker.gpsStatus = "GPS locked";
        if (previous) {
          const segment = distanceMiles(previous, point);
          if (Number.isFinite(segment) && segment < 0.25) state.runTracker.distance += segment;
        }
        refreshRunTracker();
      },
      (error) => {
        if (!state.runTracker?.active) return;
        state.runTracker.error = error.message || "GPS unavailable";
        state.runTracker.gpsStatus = "GPS unavailable";
        renderState();
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
  } else if (gpsEnabled) {
    state.runTracker.error = "GPS unavailable";
    state.runTracker.gpsStatus = "GPS unavailable";
  }

  runInterval = setInterval(refreshRunTracker, 1000);
  renderState();
}

async function updateRunTracker(field, value) {
  if (!state.runTracker) return;
  if (field === "distance") {
    state.runTracker.distance = parseNumber(value);
  }
  if (field === "notes") state.runTracker.notes = String(value || "");
}

async function finishRun() {
  if (!state.runTracker?.active) return;
  refreshRunTracker({ forcePace: true });
  const tracker = clone(state.runTracker);
  stopRunTimers();
  await put("runs", {
    id: uid("run"),
    startTime: tracker.startTime,
    endTime: new Date().toISOString(),
    distance: Number(tracker.distance) || 0,
    durationSeconds: Number(tracker.durationSeconds) || 0,
    averagePace: paceForTracker(tracker),
    gpsEnabled: Boolean(tracker.gpsEnabled),
    locations: tracker.locations || [],
    notes: tracker.notes || ""
  });
  state.runTracker = null;
  await loadData();
  renderState();
}

async function discardRun() {
  stopRunTimers();
  state.runTracker = null;
  renderState();
}

async function apply531(data) {
  const settings = {
    ...clone(state.settings),
    program: "5/3/1",
    cycle: parseNumber(data.cycle, 1),
    week: parseNumber(data.week, 1),
    increment: parseNumber(data.increment, 5),
    warmups: Boolean(data.warmups),
    firstSetLast: Boolean(data.firstSetLast),
    trainingMaxes: {
      "Bench Press": parseNumber(data.bench),
      Squat: parseNumber(data.squat),
      Press: parseNumber(data.press),
      Deadlift: parseNumber(data.deadlift)
    }
  };
  await clearStore("templates");
  await bulkPut("templates", generate531Templates(settings));
  await setSetting("preferences", settings);
  await loadData();
  renderState();
}

async function applyStrongLifts(data) {
  const settings = {
    ...clone(state.settings),
    program: "StrongLifts 5x5",
    strongLifts: {
      Squat: parseNumber(data.squat),
      "Bench Press": parseNumber(data.bench),
      "Barbell Row": parseNumber(data.row),
      "Overhead Press": parseNumber(data.press),
      Deadlift: parseNumber(data.deadlift)
    }
  };
  await clearStore("templates");
  await bulkPut("templates", generateStrongLiftsTemplates(settings));
  await setSetting("preferences", settings);
  await loadData();
  renderState();
}

async function exportBackup() {
  const backup = await exportAllData();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const today = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lifti-backup-${today}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  state.exportMessage = `Exported ${link.download}`;
  renderState();
}

async function importBackup(file) {
  if (!file) return;
  try {
    const text = await file.text();
    await importAllData(JSON.parse(text));
    state.importError = "";
    await loadData();
  } catch (error) {
    state.importError = error.message || "Import failed";
  }
  renderState();
}

function setupInstallButton() {
  const button = document.getElementById("install-button");
  if (!button) return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    button.hidden = false;
  });
  button.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => {});
    deferredInstallPrompt = null;
    button.hidden = true;
  });
}

async function init() {
  setupInstallButton();
  window.addEventListener("hashchange", () => {
    const view = window.location.hash.replace("#", "");
    if (VALID_VIEWS.includes(view) && view !== state.activeView) {
      state.activeView = view;
      localStorage.setItem("lifti:activeView", view);
      renderState();
    }
  });
  await seedDefaultsIfNeeded(defaultSeedData());
  await loadData();
  initUI({
    selectDay,
    updateTemplateName,
    updateExerciseName,
    addExercise,
    removeExercise,
    addTemplateRun,
    addSet,
    removeSet,
    updateTemplateSet,
    startSession,
    discardActive,
    discardActiveAndStart,
    cancelConflict,
    updateSessionSet,
    addSessionRun,
    finishSession,
    addBodyweight,
    updateBodyweight,
    deleteBodyweight,
    addManualRun,
    deleteRun,
    deleteHistoryItem,
    startRun,
    updateRunTracker,
    finishRun,
    discardRun,
    apply531,
    applyStrongLifts,
    exportBackup,
    importBackup,
    selectView,
    setOpenHistory(id) {
      state.openHistoryId = state.openHistoryId === id ? null : id;
      renderState();
    }
  });
  renderState();
}

init().catch((error) => {
  document.getElementById("app").innerHTML = `<section class="card"><div class="section-kicker">Error</div><h2>Could not start Lifti</h2><p class="muted">${error.message}</p></section>`;
  console.error(error);
});
