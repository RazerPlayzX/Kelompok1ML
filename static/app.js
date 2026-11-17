const fieldNames = [
  'HighBP', 'HighChol', 'BMI', 'Smoker', 'Stroke', 'HeartDiseaseorAttack',
  'PhysActivity', 'NoDocbcCost', 'GenHlth', 'MentHlth', 'PhysHlth', 'DiffWalk',
  'Sex', 'AgeGroup', 'Education',
];
const pageNames = { dashboard: 'Dashboard', screening: 'Skrining baru', history: 'Riwayat sesi' };
const sessionHistory = [];
const form = document.querySelector('#form');
const submitButton = document.querySelector('#submit');
const resetButton = document.querySelector('#reset');
const errorBox = document.querySelector('#error');
const statusLine = document.querySelector('#status');
const resultPanel = document.querySelector('#result');
const apiStatus = document.querySelector('#apiStatus');
const apiStatusText = document.querySelector('#apiStatusText');

function setBackendStatus(isOnline, message) {
  apiStatus.classList.toggle('status-offline', !isOnline);
  apiStatus.classList.remove('status-checking');
  apiStatusText.textContent = message;
}

async function checkApiStatus() {
  try {
    const response = await fetch('/health', { cache: 'no-store' });
    if (!response.ok) throw new Error('Backend tidak tersedia');
    const result = await response.json();
    if (result.status !== 'ok') throw new Error('Backend tidak tersedia');
    setBackendStatus(true, 'Backend aktif');
  } catch {
    setBackendStatus(false, 'Backend belum aktif');
  }
}

function showApplication() {
  document.querySelector('#currentDate').textContent = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date());
  updateDashboard();
  setPage('screening');
}

function setPage(page) {
  document.querySelectorAll('.page').forEach((section) => {
    const active = section.id === `page-${page}`;
    section.hidden = !active;
    section.classList.toggle('active', active);
  });
  document.querySelectorAll('.nav-link').forEach((button) => {
    button.classList.toggle('active', button.dataset.page === page);
  });
  document.querySelector('#pageTitle').textContent = pageNames[page] || 'Dashboard';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateProgress() {
  const count = fieldNames.filter((name) => {
    const field = form.elements.namedItem(name);
    return field.value !== '' && field.checkValidity();
  }).length;
  document.querySelector('#completionCount').textContent = `${count} dari ${fieldNames.length} terisi`;
  document.querySelector('.progress-track').setAttribute('aria-valuenow', String(count));
  document.querySelector('#formProgress').style.width = `${(count / fieldNames.length) * 100}%`;
}

function makePayload() {
  const values = new FormData(form);
  const payload = {};
  for (const name of fieldNames) {
    const value = values.get(name);
    payload[name] = name === 'BMI' ? Number(value) : Number.parseInt(value, 10);
  }
  return payload;
}

function explainError(body, status) {
  if (Array.isArray(body?.detail)) {
    return body.detail.map((item) => `${item.loc?.at(-1) || 'Input'}: ${item.msg}`).join(' · ');
  }
  return typeof body?.detail === 'string' ? body.detail : `Permintaan gagal (HTTP ${status}).`;
}

function renderResults(result) {
  document.querySelector('#resultLabel').textContent = result.prediction;
  document.querySelector('#disclaimer').textContent = result.disclaimer;
  document.querySelector('#confidenceBadge').textContent = `${(result.probability * 100).toFixed(1)}% keyakinan model`;
  resultPanel.dataset.class = String(result.class_id);
  const list = document.querySelector('#probs');
  list.replaceChildren();
  for (const [label, probability] of Object.entries(result.probabilities)) {
    const row = document.createElement('div');
    row.className = 'prob-row';
    const name = document.createElement('span');
    name.textContent = label;
    const track = document.createElement('span');
    track.className = 'prob-track';
    const fill = document.createElement('span');
    fill.className = 'prob-fill';
    fill.style.display = 'block';
    fill.style.width = `${Math.max(0, Math.min(100, probability * 100))}%`;
    track.append(fill);
    const value = document.createElement('span');
    value.className = 'prob-value';
    value.textContent = `${(probability * 100).toFixed(1)}%`;
    row.append(name, track, value);
    list.append(row);
  }
  resultPanel.hidden = false;
}

function renderHistoryRows(target) {
  target.replaceChildren();
  for (const item of [...sessionHistory].reverse()) {
    const row = document.createElement('tr');
    const time = document.createElement('td');
    time.textContent = item.time;
    const labelCell = document.createElement('td');
    const tag = document.createElement('span');
    tag.className = 'prediction-tag';
    tag.dataset.class = String(item.classId);
    tag.textContent = item.prediction;
    labelCell.append(tag);
    const probability = document.createElement('td');
    probability.textContent = `${(item.probability * 100).toFixed(1)}%`;
    row.append(time, labelCell, probability);
    if (target.id === 'historyRows') {
      const summary = document.createElement('td');
      summary.textContent = '15 indikator diproses';
      row.append(summary);
    }
    target.append(row);
  }
}

function updateDashboard() {
  document.querySelector('#historyCount').textContent = String(sessionHistory.length);
  const recentEmpty = document.querySelector('#dashboardRecent');
  const recentTable = document.querySelector('#recentTable');
  const historyEmpty = document.querySelector('#historyEmpty');
  const historyTable = document.querySelector('#historyTable');
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
    renderHistoryRows(document.querySelector('#recentRows'));
    renderHistoryRows(document.querySelector('#historyRows'));
  }
}

document.querySelectorAll('.nav-link').forEach((button) => {
  button.addEventListener('click', () => setPage(button.dataset.page));
});
document.querySelectorAll('[data-goto]').forEach((button) => {
  button.addEventListener('click', () => setPage(button.dataset.goto));
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.textContent = '';
  resultPanel.hidden = true;
  if (!form.reportValidity()) return;
  submitButton.disabled = true;
  resetButton.disabled = true;
  form.setAttribute('aria-busy', 'true');
  statusLine.textContent = 'Menghitung hasil skrining…';
  try {
    const response = await fetch('/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makePayload()),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(explainError(body, response.status));
    renderResults(body);
    sessionHistory.push({
      time: new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(new Date()),
      prediction: body.prediction,
      classId: body.class_id,
      probability: body.probability,
    });
    updateDashboard();
    statusLine.textContent = 'Hasil skrining berhasil diproses.';
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (errorResult) {
    if (!errorBox.textContent) {
      errorBox.textContent = errorResult instanceof TypeError
        ? 'Tidak dapat menghubungi backend. Pastikan server API berjalan.'
        : errorResult.message;
    }
    statusLine.textContent = '';
  } finally {
    submitButton.disabled = false;
    resetButton.disabled = false;
    form.setAttribute('aria-busy', 'false');
  }
});

form.addEventListener('reset', () => {
  errorBox.textContent = '';
  statusLine.textContent = '';
  resultPanel.hidden = true;
  resultPanel.removeAttribute('data-class');
  document.querySelector('#probs').replaceChildren();
  updateProgress();
});
form.addEventListener('input', updateProgress);
form.addEventListener('change', updateProgress);

async function initialize() {
  updateProgress();
  await checkApiStatus();
  showApplication();
}

initialize();
