const formatProbability = value => new Intl.NumberFormat("id-ID", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
const fieldNames = [
  "HighBP",
  "HighChol",
  "BMI",
  "Smoker",
  "Stroke",
  "HeartDiseaseorAttack",
  "PhysActivity",
  "NoDocbcCost",
  "GenHlth",
  "MentHlth",
  "PhysHlth",
  "DiffWalk",
  "Sex",
  "AgeGroup",
  "Education",
];
const pageNames = {
  dashboard: "Dashboard",
  screening: "Skrining baru",
  history: "Riwayat sesi",
};
const HISTORY_KEY = "sehatcheck-history-v1";
function loadHistory() {
  try {
    const items = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(items) ? items.filter(item => item && typeof item.time === "string" && typeof item.prediction === "string" && [0,1,2].includes(item.classId) && Number.isFinite(item.probability) && item.probability >= 0 && item.probability <= 1) : [];
  } catch { return []; }
}
const sessionHistory = loadHistory();
const form = document.querySelector("#form");
const submitButton = document.querySelector("#submit");
const resetButton = document.querySelector("#reset");
const errorBox = document.querySelector("#error");
const statusLine = document.querySelector("#status");
const resultPanel = document.querySelector("#result");
const apiStatus = document.querySelector("#apiStatus");
const apiStatusText = document.querySelector("#apiStatusText");

function setBackendStatus(isOnline, message) {
  apiStatus.classList.toggle("status-offline", !isOnline);
  apiStatus.classList.remove("status-checking");
  apiStatusText.textContent = message;
}

async function checkApiStatus() {
  try {
    const response = await fetch("/health", { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Backend tidak tersedia");
    const result = await response.json();
    if (result.status !== "ok") throw new Error("Backend tidak tersedia");
    setBackendStatus(true, "Backend aktif");
  } catch {
    setBackendStatus(false, "Backend belum aktif");
  }
}

function showApplication() {
  document.querySelector("#currentDate").textContent = new Intl.DateTimeFormat(
    "id-ID",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    },
  ).format(new Date());
  updateDashboard();
  setPage(pageNames[location.hash.slice(1)] ? location.hash.slice(1) : "dashboard");
}

function setPage(page) {
  if (!pageNames[page]) page = "dashboard";
  if (location.hash !== `#${page}`) history.pushState(null, "", `#${page}`);
  document.querySelectorAll(".page").forEach((section) => {
    const active = section.id === `page-${page}`;
    section.hidden = !active;
    section.classList.toggle("active", active);
  });
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
    if (button.dataset.page === page) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelector("#pageTitle").textContent =
    pageNames[page] || "Dashboard";
  const heading = document.querySelector(`#page-${page} h1`);
  heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
}

function updateProgress() {
  const count = fieldNames.filter((name) => {
    const field = form.elements.namedItem(name);
    return field.value !== "" && field.checkValidity();
  }).length;
  document.querySelector("#completionCount").textContent =
    `${count} dari ${fieldNames.length} terisi`;
  document
    .querySelector(".progress-track")
    .setAttribute("aria-valuenow", String(count));
  document.querySelector("#completionBottom").textContent = `${count} dari 15 jawaban valid`;
  document.querySelector("#formProgress").style.width =
    `${(count / fieldNames.length) * 100}%`;
}

function makePayload() {
  const values = new FormData(form);
  const payload = {};
  for (const name of fieldNames) {
    const value = values.get(name);
    if (value === null || value.trim() === "") throw new Error(`${name} wajib diisi.`);
    payload[name] = Number(value);
  }
  return payload;
}

function explainError(body, status) {
  if (Array.isArray(body?.detail)) {
    return body.detail
      .map((item) => `${item.loc?.at(-1) || "Input"}: ${item.msg}`)
      .join(" · ");
  }
  return typeof body?.detail === "string"
    ? body.detail
    : `Permintaan gagal (HTTP ${status}).`;
}

function renderResults(result) {
  document.querySelector("#resultLabel").textContent = result.prediction;
  document.querySelector("#disclaimer").textContent = result.disclaimer;
  document.querySelector("#confidenceBadge").textContent =
    `${formatProbability(result.probability)} probabilitas kelas`;
  resultPanel.dataset.class = String(result.class_id);
  const list = document.querySelector("#probs");
  list.replaceChildren();
  for (const [label, probability] of Object.entries(result.probabilities)) {
    const row = document.createElement("div");
    row.className = "prob-row";
    const name = document.createElement("span");
    name.textContent = label;
    const track = document.createElement("span");
    track.className = "prob-track";
    const fill = document.createElement("span");
    fill.className = "prob-fill";
    fill.style.display = "block";
    fill.style.width = `${Math.max(0, Math.min(100, probability * 100))}%`;
    track.append(fill);
    const value = document.createElement("span");
    value.className = "prob-value";
    value.textContent = `${formatProbability(probability)}`;
    row.append(name, track, value);
    list.append(row);
  }
  resultPanel.hidden = false;
}

function renderHistoryRows(target) {
  target.replaceChildren();
  for (const item of [...sessionHistory].reverse()) {
    const row = document.createElement("tr");
    const time = document.createElement("td");
    time.textContent = item.time;
    const labelCell = document.createElement("td");
    const tag = document.createElement("span");
    tag.className = "prediction-tag";
    tag.dataset.class = String(item.classId);
    tag.textContent = item.prediction;
    labelCell.append(tag);
    const probability = document.createElement("td");
    probability.textContent = `${formatProbability(item.probability)}`;
    row.append(time, labelCell, probability);
    if (target.id === "historyRows") {
      const summary = document.createElement("td");
      summary.textContent = "15 indikator diproses";
      row.append(summary);
    }
    target.append(row);
  }
}

function updateDashboard() {
  document.querySelector("#historyCount").textContent = String(
    sessionHistory.length,
  );
  const recentEmpty = document.querySelector("#dashboardRecent");
  const recentTable = document.querySelector("#recentTable");
  const historyEmpty = document.querySelector("#historyEmpty");
  const historyTable = document.querySelector("#historyTable");
  if (!sessionHistory.length) {
    recentEmpty.hidden = true;
    recentTable.hidden = true;
    historyEmpty.hidden = false;
    historyTable.hidden = true;
  } else {
    recentEmpty.hidden = false;
    recentTable.hidden = false;
    historyEmpty.hidden = true;
    historyTable.hidden = false;
    renderHistoryRows(document.querySelector("#recentRows"));
    renderHistoryRows(document.querySelector("#historyRows"));
  }
}

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => setPage(button.dataset.page));
});
document.querySelectorAll("[data-goto]").forEach((button) => {
  button.addEventListener("click", () => setPage(button.dataset.goto));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitButton.disabled) return;
  if (mobileSteps.matches && currentStep < steps.length - 1) { nextStep(); return; }
  errorBox.textContent = "";
  resultPanel.hidden = true;
  const invalid = [...form.elements].filter(el => el.name && !validateField(el));
  if (invalid.length) { errorBox.textContent = `Periksa ${invalid.length} jawaban yang belum valid.`; revealField(invalid[0]); invalid[0].focus(); return; }
  submitButton.disabled = true;
  resetButton.disabled = true;
  form.setAttribute("aria-busy", "true");
  previousButton.disabled = true;
  statusLine.textContent = "Menghitung hasil skrining…";
  try {
    const response = await fetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makePayload()),
    });
    const body = await response.json();
    if (!response.ok) {
      if (Array.isArray(body.detail)) body.detail.forEach(item => { const field = form.elements.namedItem(item.loc?.at(-1)); if (field) { revealField(field); showFieldError(field, item.msg); } });
      throw new Error(explainError(body, response.status));
    }
    renderResults(body);
    sessionHistory.push({
      time: new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "short",
      }).format(new Date()),
      prediction: body.prediction,
      classId: body.class_id,
      probability: body.probability,
    });
    try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(sessionHistory)); }
    catch { document.querySelector(".history-note").textContent = "Penyimpanan sesi browser tidak tersedia. Riwayat saat ini akan hilang setelah refresh."; }
    updateDashboard();
    statusLine.textContent = "Hasil skrining berhasil diproses.";
    resultPanel.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest" });
  } catch (errorResult) {
    if (!errorBox.textContent) {
      errorBox.textContent =
        errorResult instanceof TypeError
          ? "Tidak dapat menghubungi backend. Pastikan server API berjalan."
          : errorResult.message;
    }
    statusLine.textContent = "";
  } finally {
    submitButton.disabled = false;
    resetButton.disabled = false;
    form.setAttribute("aria-busy", "false");
    previousButton.disabled = false;
  }
});

form.addEventListener("reset", () => {
  errorBox.textContent = "";
  statusLine.textContent = "";
  resultPanel.hidden = true;
  resultPanel.removeAttribute("data-class");
  document.querySelector("#probs").replaceChildren();
  setTimeout(() => { currentStep = 0; renderStep(); updateProgress(); form.querySelectorAll(".field-error").forEach(el => el.textContent = ""); form.querySelectorAll("[aria-invalid]").forEach(el => el.removeAttribute("aria-invalid")); }, 0);
});
form.addEventListener("input", updateProgress);
form.addEventListener("change", updateProgress);

async function initialize() {
  updateProgress();
  showApplication();
  await checkApiStatus();
}

function showFieldError(field, message) {
  field.setAttribute("aria-invalid", message ? "true" : "false");
  document.getElementById(`${field.name}-error`).textContent = message;
}
function validateField(field) {
  let message = "";
  if (!field.value) message = "Pilih atau isi jawaban ini.";
  else if (!field.checkValidity()) message = `Gunakan angka ${field.min}-${field.max}${field.step === "1" ? " tanpa desimal" : ""}.`;
  showFieldError(field, message);
  return !message;
}
for (const name of fieldNames) {
  const field = form.elements.namedItem(name);
  field.id = name;
  const error = document.createElement("small");
  error.id = `${name}-error`; error.className = "field-error";
  field.closest("label").append(error);
  field.setAttribute("aria-describedby", error.id);
  field.addEventListener("blur", () => { if (field.value || field.hasAttribute("aria-invalid")) validateField(field); });
  field.addEventListener("input", () => { if (field.hasAttribute("aria-invalid")) validateField(field); });
}
document.querySelector(".brand").addEventListener("click", () => setPage("dashboard"));
window.addEventListener("hashchange", () => { if (pageNames[location.hash.slice(1)]) setPage(location.hash.slice(1)); });
window.addEventListener("focus", checkApiStatus);
const mobileSteps = matchMedia("(max-width: 760px)");
const steps = [...form.querySelectorAll(".question-group")];
let currentStep = 0;
const previousButton = document.querySelector("#previousStep");
const nextButton = document.querySelector("#nextStep");
function renderStep(animate = false, backwards = false) {
  const mobile = mobileSteps.matches;
  steps.forEach((step, index) => { step.hidden = mobile && index !== currentStep; });
  document.querySelector("#stepNavigation").hidden = !mobile;
  document.querySelector("#stepLabel").textContent = `Bagian ${currentStep + 1} dari ${steps.length}: ${steps[currentStep].querySelector("legend").textContent}`;
  previousButton.hidden = currentStep === 0;
  nextButton.hidden = currentStep === steps.length - 1;
  document.querySelector(".form-actions").hidden = mobile && currentStep !== steps.length - 1;
  document.querySelector("#completionBottom").hidden = mobile && currentStep !== steps.length - 1;
  resultPanel.classList.toggle("step-concealed", mobile && currentStep !== steps.length - 1);
  if (animate && mobile) {
    const legend = steps[currentStep].querySelector("legend");
    legend.tabIndex = -1; legend.focus({preventScroll:true});
    document.querySelector(".completion").scrollIntoView({block:"start",behavior:"instant"});
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) steps[currentStep].animate([{opacity:.4,transform:`translateX(${backwards ? -20 : 20}px)`},{opacity:1,transform:"translateX(0)"}],{duration:200,easing:"cubic-bezier(.23,1,.32,1)"});
  }
}
function revealField(field) {
  currentStep = steps.indexOf(field.closest(".question-group"));
  renderStep();
}
function nextStep() {
  const invalid = [...steps[currentStep].querySelectorAll("input,select")].filter(field => !validateField(field));
  if (invalid.length) { invalid[0].focus(); return; }
  currentStep = Math.min(currentStep + 1, steps.length - 1);
  errorBox.textContent = "";
  renderStep(true);
}
nextButton.addEventListener("click", nextStep);
previousButton.addEventListener("click", () => { currentStep = Math.max(0,currentStep-1); renderStep(true,true); });
mobileSteps.addEventListener("change", () => renderStep());
renderStep();
initialize();
