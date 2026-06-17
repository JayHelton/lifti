export const DEFAULT_EXERCISES = [
  "Bench Press",
  "Squat",
  "Deadlift",
  "Press",
  "DB Row",
  "Pullups",
  "Leg Curl",
  "Cable Fly",
  "Hammer Curl",
  "Easy Run",
  "Mobility"
];

export const DEFAULT_SETTINGS = {
  program: "5/3/1",
  cycle: 5,
  week: 2,
  unit: "lb",
  increment: 5,
  warmups: true,
  firstSetLast: true,
  trainingMaxes: {
    "Bench Press": 225,
    Squat: 315,
    Press: 135,
    Deadlift: 365
  },
  strongLifts: {
    Squat: 135,
    "Bench Press": 115,
    "DB Row": 95,
    Press: 75,
    Deadlift: 185
  }
};

const FIVE_THREE_ONE = {
  1: [
    [0.65, 5, false],
    [0.75, 5, false],
    [0.85, 5, true]
  ],
  2: [
    [0.7, 3, false],
    [0.8, 3, false],
    [0.9, 3, true]
  ],
  3: [
    [0.75, 5, false],
    [0.85, 3, false],
    [0.95, 1, true]
  ],
  4: [
    [0.4, 5, false],
    [0.5, 5, false],
    [0.6, 5, false]
  ]
};

const MAIN_LIFTS = [
  ["Bench Press", "Bench Day"],
  ["Squat", "Squat Day"],
  ["Press", "Press Day"],
  ["Deadlift", "Deadlift Day"]
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeSettings(options = {}) {
  return {
    ...clone(DEFAULT_SETTINGS),
    ...options,
    trainingMaxes: {
      ...DEFAULT_SETTINGS.trainingMaxes,
      ...(options.trainingMaxes || {})
    },
    strongLifts: {
      ...DEFAULT_SETTINGS.strongLifts,
      ...(options.strongLifts || {})
    }
  };
}

export function roundWeight(value, increment = 5) {
  const step = Number(increment) || 5;
  return Math.round(Number(value || 0) / step) * step;
}

function makeSet(targetWeight, targetReps, amrap = false) {
  return {
    targetWeight: Number(targetWeight) || 0,
    targetReps: Number(targetReps) || 0,
    amrap: Boolean(amrap)
  };
}

function workSetsForLift(lift, settings) {
  const tm = Number(settings.trainingMaxes[lift]) || 0;
  const week = Number(settings.week) || 1;
  const increment = Number(settings.increment) || 5;
  const sets = [];

  if (settings.warmups) {
    sets.push(
      makeSet(roundWeight(tm * 0.4, increment), 5),
      makeSet(roundWeight(tm * 0.5, increment), 5),
      makeSet(roundWeight(tm * 0.6, increment), 3)
    );
  }

  const work = FIVE_THREE_ONE[week] || FIVE_THREE_ONE[1];
  work.forEach(([percent, reps, amrap]) => {
    sets.push(makeSet(roundWeight(tm * percent, increment), reps, amrap));
  });

  if (settings.firstSetLast && week !== 4) {
    const firstWorkWeight = roundWeight(tm * work[0][0], increment);
    for (let i = 0; i < 5; i += 1) sets.push(makeSet(firstWorkWeight, 10));
  }

  return sets;
}

function assistance(name, sets, targetWeight = 0, targetReps = 10) {
  return {
    name,
    sets: Array.from({ length: sets }, () => makeSet(targetWeight, targetReps))
  };
}

function template(id, day, name, exercises, programMeta = {}) {
  return { id, day, name, exercises, programMeta };
}

export function generate531Templates(options = {}) {
  const settings = mergeSettings(options);
  const templates = MAIN_LIFTS.map(([lift, label], index) =>
    template(`template-day-${index + 1}`, index + 1, label, [
      { name: lift, sets: workSetsForLift(lift, settings) }
    ], {
      program: "5/3/1",
      cycle: settings.cycle,
      week: settings.week,
      lift
    })
  );

  templates[0].exercises.push(assistance("DB Row", 3, 0, 10), assistance("Cable Fly", 3, 0, 12), assistance("Hammer Curl", 3, 0, 12));
  templates[1].exercises.push(assistance("Leg Curl", 4, 0, 12), assistance("Mobility", 2, 0, 10));
  templates[2].exercises.push(assistance("Pullups", 4, 0, 8), assistance("DB Row", 3, 0, 10));
  templates[3].exercises.push(assistance("Leg Curl", 4, 0, 12), assistance("Hammer Curl", 3, 0, 12));

  templates.push(
    template("template-day-5", 5, "Upper Assistance", [
      assistance("Bench Press", 5, roundWeight(settings.trainingMaxes["Bench Press"] * 0.6, settings.increment), 5),
      assistance("Pullups", 4, 0, 8),
      assistance("DB Row", 4, 0, 10)
    ], { program: "5/3/1", cycle: settings.cycle, week: settings.week }),
    template("template-day-6", 6, "Run / Recovery", [
      assistance("Easy Run", 1, 0, 30),
      assistance("Mobility", 3, 0, 10)
    ], { program: "5/3/1", cycle: settings.cycle, week: settings.week }),
    template("template-day-7", 7, "Rest / Mobility", [
      assistance("Mobility", 3, 0, 10)
    ], { program: "5/3/1", cycle: settings.cycle, week: settings.week })
  );

  return templates;
}

export function generateStrongLiftsTemplates(options = {}) {
  const settings = mergeSettings(options);
  const w = settings.strongLifts;
  const workoutA = [
    assistance("Squat", 5, w.Squat, 5),
    assistance("Bench Press", 5, w["Bench Press"], 5),
    assistance("DB Row", 5, w["DB Row"], 5)
  ];
  const workoutB = [
    assistance("Squat", 5, w.Squat, 5),
    assistance("Press", 5, w.Press, 5),
    assistance("Deadlift", 1, w.Deadlift, 5)
  ];

  return [
    template("template-day-1", 1, "StrongLifts A", clone(workoutA), { program: "StrongLifts 5x5" }),
    template("template-day-2", 2, "StrongLifts B", clone(workoutB), { program: "StrongLifts 5x5" }),
    template("template-day-3", 3, "StrongLifts A", clone(workoutA), { program: "StrongLifts 5x5" }),
    template("template-day-4", 4, "StrongLifts B", clone(workoutB), { program: "StrongLifts 5x5" }),
    template("template-day-5", 5, "StrongLifts A", clone(workoutA), { program: "StrongLifts 5x5" }),
    template("template-day-6", 6, "StrongLifts B", clone(workoutB), { program: "StrongLifts 5x5" }),
    template("template-day-7", 7, "Run / Recovery", [
      assistance("Easy Run", 1, 0, 30),
      assistance("Mobility", 3, 0, 10)
    ], { program: "StrongLifts 5x5" })
  ];
}

export function progress531TrainingMaxes(trainingMaxes) {
  return {
    "Bench Press": Number(trainingMaxes["Bench Press"] || 0) + 5,
    Press: Number(trainingMaxes.Press || 0) + 5,
    Squat: Number(trainingMaxes.Squat || 0) + 10,
    Deadlift: Number(trainingMaxes.Deadlift || 0) + 10
  };
}

export function estimatedOneRepMax(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (!w || !r) return 0;
  if (r === 1) return w;
  return Math.round(w * (1 + r / 30));
}

function completedSets(session) {
  return (session.exercises || []).flatMap((exercise) =>
    (exercise.sets || [])
      .filter((set) => set.completed && Number(set.actualWeight) > 0 && Number(set.actualReps) > 0)
      .map((set) => ({
        exercise: exercise.name,
        weight: Number(set.actualWeight),
        reps: Number(set.actualReps),
        e1rm: estimatedOneRepMax(set.actualWeight, set.actualReps)
      }))
  );
}

export function detectPRs(session, previousSessions = []) {
  const previous = previousSessions.filter((item) => item.status === "finished").flatMap(completedSets);
  const prs = [];

  completedSets(session).forEach((current) => {
    const sameExercise = previous.filter((item) => item.exercise === current.exercise);
    const bestWeight = sameExercise.reduce((best, item) => Math.max(best, item.weight), 0);
    const bestE1rm = sameExercise.reduce((best, item) => Math.max(best, item.e1rm), 0);
    const bestRepsAtWeight = sameExercise
      .filter((item) => item.weight === current.weight)
      .reduce((best, item) => Math.max(best, item.reps), 0);

    if (current.weight > bestWeight) {
      prs.push({ type: "Weight PR", exercise: current.exercise, weight: current.weight, reps: current.reps, previous: bestWeight });
    }
    if (current.reps > bestRepsAtWeight && bestRepsAtWeight > 0) {
      prs.push({ type: "Rep PR", exercise: current.exercise, weight: current.weight, reps: current.reps, previous: bestRepsAtWeight });
    }
    if (current.e1rm > bestE1rm) {
      prs.push({ type: "Estimated 1RM PR", exercise: current.exercise, weight: current.weight, reps: current.reps, value: current.e1rm, previous: bestE1rm });
    }
  });

  const seen = new Set();
  return prs.filter((pr) => {
    const key = `${pr.type}-${pr.exercise}-${pr.weight}-${pr.reps}-${pr.value || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function defaultSeedData() {
  return {
    templates: generate531Templates(DEFAULT_SETTINGS),
    exerciseLibrary: DEFAULT_EXERCISES.map((name) => ({ name, createdAt: new Date().toISOString() })),
    settings: [{ key: "preferences", value: clone(DEFAULT_SETTINGS) }]
  };
}
