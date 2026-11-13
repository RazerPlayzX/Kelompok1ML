# Hasil pengujian backend dan integrasi dasar

Tanggal: **13 November 2026 (Asia/Jakarta)**. Lokasi proyek: `C:\Projects\proyek-ml-kelompok`. Pengujian memakai `.venv` baru di lokasi ini, Python **3.12.5**, model asli kelompok, dan scikit-learn **1.6.1**. Windows Security dan instalasi Python global tidak diubah.

## Pengujian otomatis backend — sudah dijalankan

Perintah dari root proyek:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m pip check
node --check static/app.js
```

Hasil pytest terakhir: **205 passed, 1 warning in 6.16s**; exit code 0. Pemeriksaan dependensi: **No broken requirements found**. Pemeriksaan sintaks JavaScript selesai dengan exit code 0. Node hanya digunakan untuk pemeriksaan sintaks, bukan dependensi menjalankan aplikasi.

Peringatan: `StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2 instead.` Kombinasi terpasang adalah Starlette 1.10.0 dan httpx 0.28.1. Pengujian tetap menggunakan httpx sesuai permintaan; seluruh tes lulus. Peringatan tidak disembunyikan.

| No. | Skenario | Hasil aktual |
|---|---|---|
| 1 | GET `/health` | PASS — HTTP 200, `{"status":"ok"}` |
| 2 | GET `/` | PASS — HTML, judul dan disclaimer tersedia |
| 3 | CSS dan JS | PASS — HTTP 200 dan tipe konten sesuai |
| 4 | Swagger dan OpenAPI | PASS — `/docs` HTTP 200; schema memuat contoh 15 fitur, semuanya wajib, extra ditolak |
| 5 | Payload valid dan beberapa variasi batas valid | PASS — enam variasi HTTP 200, termasuk BMI integer, BMI 12 dan 100 |
| 6 | Hasil API dibandingkan `model.predict()` langsung | PASS — class_id sama untuk semua variasi valid; model asli dimuat terpisah sebagai pembanding |
| 7 | Kesesuaian class_id dan nama kelas | PASS — sesuai pemetaan 0/1/2 di metadata |
| 8 | Probabilitas tiga kelas | PASS — sama dengan `predict_proba()`, berada pada 0–1, jumlah mendekati 1 |
| 9 | Probabilitas kelas yang diprediksi | PASS — sama dengan entri kelas terpilih pada `probabilities` |
| 10 | Urutan key JSON dibalik | PASS — backend tetap membentuk kolom sesuai urutan training |
| 11 | BMI di bawah batas dan di atas batas | PASS — HTTP 422 sebelum inference |
| 12 | MentHlth/PhysHlth di luar 0–30 | PASS — HTTP 422 sebelum inference |
| 13 | Setiap kategori di luar batas bawah/atas | PASS — HTTP 422; total 30 kasus batas invalid untuk seluruh fitur |
| 14 | Masing-masing field wajib dihilangkan | PASS — 15 kasus HTTP 422 |
| 15 | Null, boolean, string angka, teks, list, objek | PASS — masing-masing dicoba pada semua 15 field; total 105 kasus HTTP 422 |
| 16 | Integer kategori/hari dikirim sebagai 1.0 atau 1.5 | PASS — 28 kasus HTTP 422 |
| 17 | BMI NaN, Infinity, -Infinity | PASS — HTTP 422, detail dapat diserialisasi; tidak berubah menjadi HTTP 500 |
| 18 | Field tambahan/target | PASS — `DiabetesStatus`, `DIABETE4`, `DIABTYPE`, dan `extra` ditolak HTTP 422 |
| 19 | JSON rusak atau body bukan objek | PASS — empat kasus HTTP 422 |
| 20 | Model hilang | PASS — startup aplikasi terisolasi gagal dengan pesan jelas; model asli tidak dihapus |
| 21 | Model rusak | PASS — file sementara menyebabkan startup gagal dengan pesan jelas |
| 22 | Pemuatan model sekali | PASS — dua request valid dalam satu startup memanggil `joblib.load()` tepat sekali |
| 23 | Error inference tak terduga | PASS — HTTP 500 berpesan umum; detail error tercatat di log, tidak bocor ke respons |
| 24 | Pemetaan berdasarkan `classes_` | PASS — hasil tetap sama ketika wrapper tes mengurutkan ulang kelas dan kolom probabilitas asli menjadi [2, 0, 1] |
| 25 | Input invalid tidak memanggil model | PASS — spy pada `predict` dan `predict_proba` tidak dipanggil di seluruh pengujian invalid |

Pada percobaan awal ada error teardown pengujian karena pemulihan atribut dinamis `app.state` oleh monkeypatch. Tes diperbaiki agar memulihkan objek model secara eksplisit melalui `finally`; suite lengkap kemudian dijalankan ulang dan lulus. File pipeline tidak diubah.

## Pemeriksaan model asli

Hasil inspeksi: Pipeline berisi ColumnTransformer; jalur numerik memakai SimpleImputer median dan StandardScaler; jalur kategorikal memakai SimpleImputer most_frequent dan OneHotEncoder; classifier adalah RandomForestClassifier (100 estimator, max_depth 15, min_samples_leaf 5). `feature_names_in_` sesuai 15 fitur dan urutan kontrak; `classes_` adalah `[0, 1, 2]`.

Hash SHA-256 file hasil salinan cocok dengan byte di ZIP sumber:

```text
model_kelompok_1.joblib
573e2096d63060683bf82a22d4a33aa1043689b28ec3c68ee03b584001a1ea72

model_info.json
bd980a9b586c6c8d033b5bf8e4b708c65fead243b4cd34b22017ff52a4ba7cfd
```

Untuk contoh request pada README/Swagger, hasil aktual pipeline adalah class_id **2** dengan nama kelas **Diabetes**:

| Kelas | Probabilitas API |
|---|---:|
| Tidak diabetes | 0.17950424271603566 |
| Prediabetes | 0.3264985237072484 |
| Diabetes | 0.4939972335767225 |

Angka ini dicatat dari eksekusi model, bukan expected label yang ditetapkan manual. Ini adalah prediksi kelas model, bukan diagnosis. Probabilitas bukan accuracy.

## Pemeriksaan browser — sudah dijalankan

Server dijalankan dengan `.\.venv\Scripts\python.exe -m uvicorn app:app --reload` pada `http://127.0.0.1:8000`. Startup Uvicorn berhasil. Pemeriksaan memakai **Playwright 1.65.1 dengan Microsoft Edge headless** di Windows. Playwright dipasang dalam environment alat sementara, bukan dependensi aplikasi.

| Skenario | Hasil aktual |
|---|---|
| Health melalui server HTTP nyata | PASS — HTTP 200 |
| Form kosong | PASS — validasi HTML mencegah submit |
| Guard JS untuk field kosong | PASS — pesan wajib diisi tampil sebelum konversi angka |
| Request valid melalui Fetch | PASS — seluruh 15 nilai berupa angka JSON dan sama dengan contoh input |
| Submit tanpa reload | PASS — jumlah navigasi main frame tidak bertambah |
| Loading | PASS — request ditahan oleh pengujian; status mengirim tampil dan kedua tombol nonaktif |
| Hasil | PASS — label dan tiga probabilitas UI sama dengan API model asli |
| Reset | PASS — input, hasil, error, dan status dibersihkan |
| Error 422 | PASS — request browser diubah menjadi BMI 11; server mengembalikan 422 dan UI menampilkan detail `body.BMI` |
| Request jaringan gagal | PASS — request di-abort oleh pengujian; pesan koneksi tampil, tombol aktif kembali |
| Desktop 1440×1100 | PASS — grid tiga kolom, tidak ada overflow horizontal; screenshot diperiksa secara visual |
| Viewport mobile 390×844 | PASS — grid satu kolom, submit berhasil, tidak ada overflow horizontal; screenshot diperiksa secara visual |
| Error JavaScript tidak tertangani | PASS — tidak ada `pageerror` selama skenario tersebut |

Screenshot aktual:

- [Desktop — hasil prediksi](screenshots/desktop-hasil.png)
- [Desktop — detail error 422](screenshots/desktop-error-422.png)
- [Mobile — hasil prediksi](screenshots/mobile-hasil.png)

Ringkasan hasil skrip browser tersedia di [browser-results.json](browser-results.json). Simulasi delay, input invalid, dan network failure hanya dilakukan pada pengujian browser; tidak ditambahkan sebagai perilaku aplikasi.

## Belum diverifikasi / di luar lingkup

- Ponsel fisik, Safari, Firefox, dan seluruh variasi resolusi/perangkat; pengujian mobile di atas memakai viewport Edge desktop.
- Interaksi manual tombol Try it out di Swagger; halaman dan schema/contoh request sudah diuji otomatis.
- Beban pengguna bersamaan, deployment publik, dan seluruh skenario end-to-end tugas besar.
- Audit ulang dataset/training, kalibrasi probabilitas, generalisasi populasi, dan validasi klinis.
- Penyelesaian laporan PDF kelompok. Screenshot ini dapat menjadi bahan laporan, tetapi bukan laporan lengkap.

Backend menyelesaikan langkah 5 dengan integrasi dasar langkah 6; catatan ini tidak menyatakan keseluruhan tugas besar sudah selesai.
