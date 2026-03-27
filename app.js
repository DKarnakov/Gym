const STORAGE_KEY = "fit-flow-state-v1";
const REST_SECONDS = 120;

const state = loadState();

const exerciseForm = document.getElementById("exerciseForm");
const exerciseNameInput = document.getElementById("exerciseName");
const exerciseSetsInput = document.getElementById("exerciseSets");
const exerciseWeightsInput = document.getElementById("exerciseWeights");
const workoutForm = document.getElementById("workoutForm");
const workoutNameInput = document.getElementById("workoutName");
const saveWorkoutBtn = document.getElementById("saveWorkoutBtn");
const newWorkoutBtn = document.getElementById("newWorkoutBtn");
const savedWorkouts = document.getElementById("savedWorkouts");
const editorWorkoutName = document.getElementById("editorWorkoutName");
const exerciseLibrary = document.getElementById("exerciseLibrary");
const workoutPlan = document.getElementById("workoutPlan");
const clearWorkoutBtn = document.getElementById("clearWorkoutBtn");
const completeSetBtn = document.getElementById("completeSetBtn");
const skipRestBtn = document.getElementById("skipRestBtn");
const finishWorkoutBtn = document.getElementById("finishWorkoutBtn");
const runnerEmpty = document.getElementById("runnerEmpty");
const runnerView = document.getElementById("runnerView");
const currentExerciseName = document.getElementById("currentExerciseName");
const currentExerciseIndex = document.getElementById("currentExerciseIndex");
const totalExercises = document.getElementById("totalExercises");
const currentSetLabel = document.getElementById("currentSetLabel");
const currentWeight = document.getElementById("currentWeight");
const restTimer = document.getElementById("restTimer");
const timerStatus = document.getElementById("timerStatus");
const exerciseCount = document.getElementById("exerciseCount");
const workoutCount = document.getElementById("workoutCount");

let restIntervalId = null;
let draggedWorkoutId = null;

exerciseForm.addEventListener("submit", handleExerciseSubmit);
workoutForm.addEventListener("submit", handleWorkoutSubmit);
newWorkoutBtn.addEventListener("click", prepareNewWorkout);
clearWorkoutBtn.addEventListener("click", clearWorkout);
completeSetBtn.addEventListener("click", completeCurrentSet);
skipRestBtn.addEventListener("click", skipRest);
finishWorkoutBtn.addEventListener("click", finishWorkout);

render();
resumeRestIfNeeded();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultState();
    }

    const parsed = JSON.parse(raw);
    const workouts = normalizeWorkouts(parsed);

    return {
      exercises: Array.isArray(parsed.exercises) ? parsed.exercises : [],
      workouts,
      editorWorkoutId: findInitialEditorWorkoutId(workouts, parsed.editorWorkoutId),
      runner: parsed.runner && typeof parsed.runner === "object" ? parsed.runner : createDefaultState().runner,
    };
  } catch (error) {
    return createDefaultState();
  }
}

function createDefaultState() {
  return {
    exercises: [],
    workouts: [],
    editorWorkoutId: null,
    runner: {
      active: false,
      workoutId: null,
      workoutIndex: 0,
      setIndex: 0,
      resting: false,
      remainingSeconds: REST_SECONDS,
      completedSets: {},
    },
  };
}

function normalizeWorkouts(parsed) {
  if (Array.isArray(parsed.workouts)) {
    return parsed.workouts
      .map((workout) => ({
        id: workout.id || crypto.randomUUID(),
        name: typeof workout.name === "string" && workout.name.trim() ? workout.name.trim() : "Тренировка",
        items: Array.isArray(workout.items) ? workout.items : [],
        createdAt: workout.createdAt || Date.now(),
      }))
      .filter((workout) => workout.items.every((item) => item && item.workoutId && item.exerciseId));
  }

  if (Array.isArray(parsed.workout) && parsed.workout.length) {
    return [
      {
        id: crypto.randomUUID(),
        name: "Моя тренировка",
        items: parsed.workout,
        createdAt: Date.now(),
      },
    ];
  }

  return [];
}

function findInitialEditorWorkoutId(workouts, savedId) {
  if (savedId && workouts.some((item) => item.id === savedId)) {
    return savedId;
  }

  return workouts[0]?.id || null;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function handleExerciseSubmit(event) {
  event.preventDefault();

  const name = exerciseNameInput.value.trim();
  const sets = Number.parseInt(exerciseSetsInput.value, 10);
  const weights = parseWeights(exerciseWeightsInput.value, sets);

  if (!name || !Number.isInteger(sets) || sets < 1 || weights.length !== sets) {
    window.alert("Проверьте название упражнения, количество подходов и список весов.");
    return;
  }

  state.exercises.unshift({
    id: crypto.randomUUID(),
    name,
    sets,
    weights,
    createdAt: Date.now(),
  });

  saveState();
  exerciseForm.reset();
  exerciseSetsInput.value = "3";
  render();
}

function parseWeights(value, sets) {
  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number.parseFloat(item.replace(",", ".")))
    .filter((item) => Number.isFinite(item) && item >= 0);

  if (!parts.length) {
    return [];
  }

  while (parts.length < sets) {
    parts.push(parts[parts.length - 1]);
  }

  return parts.slice(0, sets);
}

function addExerciseToWorkout(exerciseId) {
  const editorWorkout = ensureEditorWorkout();
  const exercise = state.exercises.find((item) => item.id === exerciseId);
  if (!exercise || !editorWorkout) {
    return;
  }

  editorWorkout.items.push({
    workoutId: crypto.randomUUID(),
    exerciseId: exercise.id,
  });

  saveState();
  render();
}

function removeExercise(exerciseId) {
  state.exercises = state.exercises.filter((item) => item.id !== exerciseId);
  state.workouts.forEach((workout) => {
    workout.items = workout.items.filter((item) => item.exerciseId !== exerciseId);
  });

  const activeWorkout = getActiveRunnerWorkout();
  if (state.runner.active && (!activeWorkout || !activeWorkout.items.length)) {
    resetRunner();
  }

  saveState();
  render();
}

function removeWorkoutItem(workoutId) {
  const editorWorkout = getEditorWorkout();
  if (!editorWorkout) {
    return;
  }

  editorWorkout.items = editorWorkout.items.filter((item) => item.workoutId !== workoutId);

  if (state.runner.active && state.runner.workoutId === editorWorkout.id) {
    if (!editorWorkout.items.length) {
      resetRunner();
    } else if (state.runner.workoutIndex >= editorWorkout.items.length) {
      state.runner.workoutIndex = editorWorkout.items.length - 1;
      state.runner.setIndex = 0;
      stopRestTimer();
      state.runner.resting = false;
      state.runner.remainingSeconds = REST_SECONDS;
    }
  }

  saveState();
  render();
}

function clearWorkout() {
  const editorWorkout = getEditorWorkout();
  if (!editorWorkout) {
    return;
  }

  editorWorkout.items = [];
  if (state.runner.active && state.runner.workoutId === editorWorkout.id) {
    resetRunner();
  }
  saveState();
  render();
}

function handleWorkoutSubmit(event) {
  event.preventDefault();

  const name = workoutNameInput.value.trim();
  const editorWorkout = getEditorWorkout();

  if (!name) {
    window.alert("Введите название тренировки.");
    return;
  }

  if (!editorWorkout || isEditorDraft()) {
    const newWorkout = {
      id: crypto.randomUUID(),
      name,
      items: [],
      createdAt: Date.now(),
    };
    state.workouts.unshift(newWorkout);
    state.editorWorkoutId = newWorkout.id;
  } else {
    editorWorkout.name = name;
  }

  saveState();
  render();
}

function prepareNewWorkout() {
  if (state.runner.active) {
    resetRunner();
  }

  state.editorWorkoutId = null;
  workoutNameInput.value = "";
  saveState();
  render();
}

function startWorkout(workoutId) {
  const workout = state.workouts.find((item) => item.id === workoutId);
  if (!workout || !workout.items.length) {
    window.alert("Сначала добавьте упражнения в тренировку.");
    return;
  }

  stopRestTimer();
  state.runner = {
    active: true,
    workoutId: workout.id,
    workoutIndex: 0,
    setIndex: 0,
    resting: false,
    remainingSeconds: REST_SECONDS,
    completedSets: {},
  };

  saveState();
  render();
}

function finishWorkout() {
  resetRunner();
  saveState();
  render();
}

function resetRunner() {
  stopRestTimer();
  state.runner = createDefaultState().runner;
}

function completeCurrentSet() {
  const workoutExercise = getCurrentWorkoutExercise();
  const activeWorkout = getActiveRunnerWorkout();
  if (!workoutExercise || state.runner.resting) {
    return;
  }

  const completedKey = workoutExercise.workoutId;
  const currentCompleted = state.runner.completedSets[completedKey] || 0;
  state.runner.completedSets[completedKey] = currentCompleted + 1;

  const nextSetIndex = state.runner.setIndex + 1;
  const hasNextSet = nextSetIndex < workoutExercise.exercise.sets;
  const hasNextExercise = state.runner.workoutIndex + 1 < (activeWorkout?.items.length || 0);

  if (hasNextSet) {
    state.runner.setIndex = nextSetIndex;
    beginRest();
  } else if (hasNextExercise) {
    state.runner.workoutIndex += 1;
    state.runner.setIndex = 0;
    beginRest();
  } else {
    window.alert("Тренировка завершена.");
    resetRunner();
  }

  saveState();
  render();
}

function beginRest() {
  stopRestTimer();
  state.runner.resting = true;
  if (state.runner.remainingSeconds <= 0 || state.runner.remainingSeconds > REST_SECONDS) {
    state.runner.remainingSeconds = REST_SECONDS;
  }
  restIntervalId = window.setInterval(() => {
    if (state.runner.remainingSeconds > 0) {
      state.runner.remainingSeconds -= 1;
      updateRunnerView();
      saveState();
      return;
    }

    skipRest();
  }, 1000);
}

function resumeRestIfNeeded() {
  if (state.runner.active && state.runner.resting && state.runner.remainingSeconds > 0) {
    beginRest();
    updateRunnerView();
  }
}

function skipRest() {
  stopRestTimer();
  state.runner.resting = false;
  state.runner.remainingSeconds = REST_SECONDS;
  saveState();
  render();
}

function stopRestTimer() {
  if (restIntervalId) {
    window.clearInterval(restIntervalId);
    restIntervalId = null;
  }
}

function getCurrentWorkoutExercise() {
  const activeWorkout = getActiveRunnerWorkout();
  const workoutItem = activeWorkout?.items[state.runner.workoutIndex];
  if (!workoutItem) {
    return null;
  }

  const exercise = state.exercises.find((item) => item.id === workoutItem.exerciseId);
  if (!exercise) {
    return null;
  }

  return { workoutId: workoutItem.workoutId, exercise };
}

function getEditorWorkout() {
  return state.workouts.find((item) => item.id === state.editorWorkoutId) || null;
}

function ensureEditorWorkout() {
  const existing = getEditorWorkout();
  if (existing) {
    return existing;
  }

  const draftWorkout = {
    id: crypto.randomUUID(),
    name: "Новая тренировка",
    items: [],
    createdAt: Date.now(),
  };

  state.workouts.unshift(draftWorkout);
  state.editorWorkoutId = draftWorkout.id;
  return draftWorkout;
}

function getActiveRunnerWorkout() {
  return state.workouts.find((item) => item.id === state.runner.workoutId) || null;
}

function isEditorDraft() {
  return !state.editorWorkoutId;
}

function render() {
  renderExerciseLibrary();
  renderSavedWorkouts();
  renderWorkoutPlan();
  updateRunnerView();
  exerciseCount.textContent = String(state.exercises.length);
  workoutCount.textContent = String(state.workouts.length);
}

function renderExerciseLibrary() {
  exerciseLibrary.innerHTML = "";

  if (!state.exercises.length) {
    exerciseLibrary.appendChild(createEmptyState("Пока пусто", "Добавьте первое упражнение, чтобы собрать тренировку."));
    return;
  }

  state.exercises.forEach((exercise) => {
    const card = document.createElement("article");
    card.className = "exercise-card";

    const title = document.createElement("h3");
    title.textContent = exercise.name;

    const meta = document.createElement("div");
    meta.className = "meta-line";
    meta.innerHTML = `<span class="tag">${exercise.sets} подхода(ов)</span>`;

    const preview = document.createElement("div");
    preview.className = "set-preview";
    exercise.weights.forEach((weight, index) => {
      const badge = document.createElement("span");
      badge.className = "tag";
      badge.textContent = `${index + 1}: ${formatWeight(weight)} кг`;
      preview.appendChild(badge);
    });

    const actions = document.createElement("div");
    actions.className = "exercise-actions";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "primary-btn";
    addBtn.textContent = "В тренировку";
    addBtn.addEventListener("click", () => addExerciseToWorkout(exercise.id));
    addBtn.hidden = state.runner.active || !canEditWorkout();

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ghost-btn";
    removeBtn.textContent = "Удалить";
    removeBtn.addEventListener("click", () => removeExercise(exercise.id));
    removeBtn.hidden = state.runner.active;

    actions.append(addBtn, removeBtn);
    card.append(title, meta, preview, actions);
    exerciseLibrary.appendChild(card);
  });
}

function renderWorkoutPlan() {
  const editorWorkout = getEditorWorkout();
  const items = editorWorkout?.items || [];

  editorWorkoutName.textContent = editorWorkout?.name || "Новая тренировка";
  workoutNameInput.value = editorWorkout?.name || "";
  saveWorkoutBtn.textContent = editorWorkout ? "Сохранить изменения" : "Создать тренировку";
  saveWorkoutBtn.hidden = state.runner.active;
  newWorkoutBtn.hidden = state.runner.active;
  clearWorkoutBtn.hidden = state.runner.active || !editorWorkout || !items.length;
  workoutNameInput.disabled = state.runner.active;
  workoutPlan.innerHTML = "";

  if (!items.length) {
    workoutPlan.appendChild(createEmptyState("Состав пуст", "Добавьте упражнения из библиотеки. Порядок можно менять перетаскиванием."));
    return;
  }

  items.forEach((item, index) => {
    const exercise = state.exercises.find((entry) => entry.id === item.exerciseId);
    if (!exercise) {
      return;
    }

    const article = document.createElement("article");
    article.className = "workout-item";
    article.draggable = true;
    article.dataset.workoutId = item.workoutId;

    if (state.runner.active && state.runner.workoutId === editorWorkout?.id && index === state.runner.workoutIndex) {
      article.classList.add("active");
    }

    article.addEventListener("dragstart", handleDragStart);
    article.addEventListener("dragover", handleDragOver);
    article.addEventListener("drop", handleDrop);
    article.addEventListener("dragend", handleDragEnd);

    const handle = document.createElement("p");
    handle.className = "runner-label drag-handle";
    handle.textContent = `Упражнение ${index + 1}`;

    const title = document.createElement("h3");
    title.textContent = exercise.name;

    const preview = document.createElement("div");
    preview.className = "set-preview";
    exercise.weights.forEach((weight, setIndex) => {
      const badge = document.createElement("span");
      badge.className = "tag";
      badge.textContent = `${setIndex + 1}: ${formatWeight(weight)} кг`;
      preview.appendChild(badge);
    });

    const actions = document.createElement("div");
    actions.className = "workout-actions";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ghost-btn";
    removeBtn.textContent = "Убрать";
    removeBtn.addEventListener("click", () => removeWorkoutItem(item.workoutId));
    removeBtn.hidden = state.runner.active;

    actions.appendChild(removeBtn);
    article.append(handle, title, preview, actions);
    workoutPlan.appendChild(article);
  });
}

function renderSavedWorkouts() {
  savedWorkouts.innerHTML = "";

  if (!state.workouts.length) {
    savedWorkouts.appendChild(createEmptyState("Сохранённых тренировок нет", "Введите название и создайте первую тренировку, затем добавьте в неё упражнения."));
    return;
  }

  state.workouts.forEach((workout) => {
    const card = document.createElement("article");
    card.className = "saved-workout-card";

    if (workout.id === state.editorWorkoutId) {
      card.classList.add("active");
    }

    if (workout.id === state.runner.workoutId) {
      card.classList.add("running");
    }

    const title = document.createElement("h3");
    title.textContent = workout.name;

    const meta = document.createElement("div");
    meta.className = "meta-line";
    meta.innerHTML = `<span class="tag">${workout.items.length} упражнений</span>`;

    const actions = document.createElement("div");
    actions.className = "workout-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "ghost-btn";
    editBtn.textContent = "Открыть";
    editBtn.addEventListener("click", () => openWorkoutEditor(workout.id));
    editBtn.hidden = state.runner.active || workout.id === state.editorWorkoutId;

    const startBtn = document.createElement("button");
    startBtn.type = "button";
    startBtn.className = "primary-btn";
    startBtn.textContent = "Запустить";
    startBtn.addEventListener("click", () => startWorkout(workout.id));
    startBtn.hidden = state.runner.active || !workout.items.length;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "danger-btn";
    removeBtn.textContent = "Удалить";
    removeBtn.addEventListener("click", () => deleteWorkout(workout.id));
    removeBtn.hidden = state.runner.active;

    actions.append(editBtn, startBtn, removeBtn);
    card.append(title, meta, actions);
    savedWorkouts.appendChild(card);
  });
}

function openWorkoutEditor(workoutId) {
  state.editorWorkoutId = workoutId;
  saveState();
  render();
}

function deleteWorkout(workoutId) {
  state.workouts = state.workouts.filter((item) => item.id !== workoutId);

  if (state.runner.active && state.runner.workoutId === workoutId) {
    resetRunner();
  }

  if (state.editorWorkoutId === workoutId) {
    state.editorWorkoutId = state.workouts[0]?.id || null;
  }

  saveState();
  render();
}

function updateRunnerView() {
  if (!state.runner.active) {
    runnerEmpty.classList.remove("hidden");
    runnerView.classList.add("hidden");
    restTimer.textContent = formatTime(REST_SECONDS);
    timerStatus.textContent = "Таймер готов";
    timerStatus.classList.remove("resting");
    skipRestBtn.hidden = true;
    completeSetBtn.hidden = true;
    finishWorkoutBtn.hidden = true;
    return;
  }

  const workoutExercise = getCurrentWorkoutExercise();
  if (!workoutExercise) {
    resetRunner();
    runnerEmpty.classList.remove("hidden");
    runnerView.classList.add("hidden");
    return;
  }

  runnerEmpty.classList.add("hidden");
  runnerView.classList.remove("hidden");

  currentExerciseName.textContent = workoutExercise.exercise.name;
  currentExerciseIndex.textContent = String(state.runner.workoutIndex + 1);
  totalExercises.textContent = String(getActiveRunnerWorkout()?.items.length || 0);
  currentSetLabel.textContent = `${state.runner.setIndex + 1} / ${workoutExercise.exercise.sets}`;
  currentWeight.textContent = formatWeight(workoutExercise.exercise.weights[state.runner.setIndex] || 0);
  restTimer.textContent = formatTime(state.runner.remainingSeconds);
  finishWorkoutBtn.hidden = false;

  if (state.runner.resting) {
    timerStatus.textContent = "Идёт отдых. Следующий подход станет доступен после таймера.";
    timerStatus.classList.add("resting");
    completeSetBtn.hidden = true;
    skipRestBtn.hidden = false;
  } else {
    timerStatus.textContent = "Можно начинать следующий подход.";
    timerStatus.classList.remove("resting");
    completeSetBtn.hidden = false;
    skipRestBtn.hidden = true;
  }
}

function canEditWorkout() {
  return !state.runner.active;
}

function createEmptyState(title, description) {
  const template = document.getElementById("emptyStateTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector("h3").textContent = title;
  node.querySelector("p").textContent = description;
  return node;
}

function formatWeight(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function handleDragStart(event) {
  draggedWorkoutId = event.currentTarget.dataset.workoutId;
  event.currentTarget.classList.add("dragging");
}

function handleDragOver(event) {
  event.preventDefault();
}

function handleDrop(event) {
  event.preventDefault();
  const editorWorkout = getEditorWorkout();
  const targetWorkoutId = event.currentTarget.dataset.workoutId;

  if (!editorWorkout || !draggedWorkoutId || draggedWorkoutId === targetWorkoutId) {
    return;
  }

  const fromIndex = editorWorkout.items.findIndex((item) => item.workoutId === draggedWorkoutId);
  const toIndex = editorWorkout.items.findIndex((item) => item.workoutId === targetWorkoutId);

  if (fromIndex === -1 || toIndex === -1) {
    return;
  }

  const currentWorkoutId = editorWorkout.items[state.runner.workoutIndex]?.workoutId;
  const [moved] = editorWorkout.items.splice(fromIndex, 1);
  editorWorkout.items.splice(toIndex, 0, moved);

  if (state.runner.active && state.runner.workoutId === editorWorkout.id && currentWorkoutId) {
    state.runner.workoutIndex = Math.max(
      0,
      editorWorkout.items.findIndex((item) => item.workoutId === currentWorkoutId)
    );
  }

  saveState();
  render();
}

function handleDragEnd(event) {
  event.currentTarget.classList.remove("dragging");
  draggedWorkoutId = null;
}
