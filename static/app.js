const form = document.getElementById("predictionForm");
const statusText = document.getElementById("status");
const resultBox = document.getElementById("result");
const errorBox = document.getElementById("error");
const submitBtn = document.getElementById("submitBtn");
const resetBtn = document.getElementById("resetBtn");
const predictionText = document.getElementById("prediction");
const probabilityText = document.getElementById("probability");
const probabilitiesList = document.getElementById("probabilities");

function clearResult() {
  resultBox.hidden = true;
  errorBox.hidden = true;
  errorBox.textContent = "";
  predictionText.textContent = "";
  probabilityText.textContent = "";
  probabilitiesList.replaceChildren();
  statusText.textContent = "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitBtn.disabled) return;
  clearResult();
  submitBtn.disabled = true;
  resetBtn.disabled = true;
  form.setAttribute("aria-busy", "true");

  try {
    const formData = new FormData(form);
    const payload = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`Field ${key} wajib diisi.`);
      }
      payload[key] = Number(value);
      if (!Number.isFinite(payload[key])) {
        throw new Error(`Field ${key} harus berupa angka yang valid.`);
      }
    }
    statusText.textContent = "Mengirim request ke API...";
    const response = await fetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      const details = Array.isArray(data.detail)
        ? data.detail.map((item) => `${item.loc?.join(".")}: ${item.msg}`).join("; ")
        : (data.detail || `Request gagal (HTTP ${response.status}).`);
      throw new Error(details);
    }

    predictionText.textContent = data.prediction;
    probabilityText.textContent = `${(data.probability * 100).toFixed(2)}%`;
    for (const label of ["Tidak diabetes", "Prediabetes", "Diabetes"]) {
      const item = document.createElement("li");
      item.textContent = `${label}: ${(data.probabilities[label] * 100).toFixed(2)}%`;
      probabilitiesList.appendChild(item);
    }
    resultBox.hidden = false;
    statusText.textContent = "Prediksi kelas model berhasil diterima.";
  } catch (error) {
    const message = error instanceof TypeError
      ? "Tidak dapat menghubungi API. Periksa koneksi dan pastikan server berjalan."
      : error.message;
    errorBox.textContent = `Gagal memproses prediksi: ${message}`;
    errorBox.hidden = false;
    statusText.textContent = "Request gagal.";
  } finally {
    submitBtn.disabled = false;
    resetBtn.disabled = false;
    form.setAttribute("aria-busy", "false");
  }
});

form.addEventListener("reset", clearResult);
