# Screening Awal Status Diabetes

Prototipe akademik Praktikum Machine Learning kelompok 1 untuk tema Kesehatan & Medis. Aplikasi menggunakan pipeline **Random Forest (tuned)** milik kelompok untuk klasifikasi `DiabetesStatus`.

Proyek ini menyediakan web skrining responsif dengan formulir, hasil prediksi, estimasi probabilitas, dan REST API FastAPI. Halaman skrining dapat langsung dibuka tanpa login. Proyek ini merupakan prototipe akademik, bukan alat diagnosis.

## Struktur proyek

```text
proyek-ml-kelompok/
├── app.py
├── requirements.txt
├── requirements-dev.txt
├── README.md
├── .gitignore
├── model/
│   ├── model_kelompok_1.joblib
│   └── model_info.json
├── static/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── tests/
│   └── test_api.py
└── docs/
    └── pengujian_backend.md
```

`.venv/` dibuat lokal dan tidak dimasukkan ke repository atau ZIP pengumpulan. CSV dan gambar evaluasi tetap berada di ZIP sumber karena tidak diperlukan untuk inference.

## Acuan dan alur aplikasi

Acuan yang dibaca: ketentuan tugas besar, kontrak `model_info.json` dan model asli, source `Prediksi_Student.zip`, lalu Modul 9. File acuan tersedia di `C:\Users\Chris\Downloads`, bukan di workspace awal. Environment `.venv-1`, `site-packages`, model siswa, dan cache dari ZIP contoh tidak disalin atau dijalankan.

Alur: **Form → Fetch → FastAPI → validasi Pydantic → DataFrame → pipeline → JSON → hasil**.

Backend tetap berada dalam satu `app.py`. `BASE_DIR` menggunakan lokasi file sehingga path model dan static tidak bergantung pada lokasi terminal. `joblib.load()` dipanggil sekali pada startup tiap proses Uvicorn melalui lifespan. Startup memeriksa versi scikit-learn, metadata, `feature_names_in_`, dan `classes_`. Model yang hilang, rusak, atau tidak cocok menghentikan startup; tidak ada prediksi dummy. Saat `--reload` memulai proses baru, proses baru tersebut memuat model sekali lagi.

Request valid diubah dengan `payload.model_dump()` menjadi DataFrame satu baris, dengan urutan kolom sesuai model. Pipeline asli menangani imputasi, scaling, encoding, dan classifier. Backend tidak menjalankan `fit()`, `fit_transform()`, atau preprocessing tambahan. Model tidak perlu training ulang dan file model tidak diubah.

## Menjalankan pada Windows / PowerShell

Buka folder proyek ini di VS Code dan jalankan perintah dari root proyek:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Jalankan server dengan:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Jika environment sudah diaktifkan, alternatif perintahnya:

```powershell
uvicorn app:app --host 127.0.0.1 --port 8000
```

Tidak perlu mengaktifkan environment atau mengubah ExecutionPolicy untuk menggunakan perintah lengkap `.\.venv\Scripts\python.exe`. Buka halaman dari FastAPI, bukan Live Server atau `file://`. Form dan API menggunakan origin yang sama sehingga CORS wildcard tidak diperlukan.

- Web skrining: http://127.0.0.1:8000/
- Swagger UI: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/health

Hentikan server dengan `Ctrl+C`. Di Swagger, buka `POST /predict`, klik **Try it out**, gunakan contoh request yang sudah tersedia, lalu **Execute**. `/docs` menggunakan aset Swagger dari CDN; jika internet tidak tersedia, form lokal dan API tetap dapat diuji langsung.

**scikit-learn wajib 1.6.1**, sesuai metadata. Versi dependensi lain dipin berdasarkan environment inference yang dipasang dan diuji untuk proyek ini, bukan diklaim sebagai versi training yang tidak tercatat. Hasil aktual pengujian tersedia di [catatan pengujian](docs/pengujian_backend.md).

## Kontrak input

Semua 15 field wajib diisi, tidak boleh `null`, dan field tambahan ditolak (`extra="forbid"`). Integer menggunakan validasi ketat: boolean, string angka, serta bilangan JSON desimal seperti `1.0` atau `1.5` ditolak. BMI menerima angka JSON integer atau desimal yang finite; string, boolean, NaN, dan infinity ditolak. Input invalid menghasilkan HTTP 422 sebelum model dipanggil.

Urutan fitur DataFrame adalah urutan pada tabel berikut. Nama JSON tetap menggunakan nama fitur training.

| Fitur | Tipe dan batas | Makna |
|---|---|---|
| `HighBP` | Integer 0–1 | Riwayat tekanan darah tinggi; 0 tidak, 1 ya |
| `HighChol` | Integer 0–1 | Riwayat kolesterol tinggi; 0 tidak, 1 ya |
| `BMI` | Angka finite 12–100 | BMI hasil cleaning, misalnya 31.5 |
| `Smoker` | Integer 0–1 | Pernah merokok minimal 100 batang sepanjang hidup, bukan hanya status perokok saat ini |
| `Stroke` | Integer 0–1 | Riwayat stroke |
| `HeartDiseaseorAttack` | Integer 0–1 | Riwayat penyakit jantung koroner/serangan jantung |
| `PhysActivity` | Integer 0–1 | Aktivitas fisik di luar pekerjaan dalam sebulan terakhir |
| `NoDocbcCost` | Integer 0–1 | Pernah terkendala biaya untuk mengakses dokter |
| `GenHlth` | Integer 1–5 | 1 sangat baik sekali, 2 sangat baik, 3 baik, 4 cukup, 5 buruk |
| `MentHlth` | Integer 0–30 | Hari kesehatan mental tidak baik dalam 30 hari terakhir |
| `PhysHlth` | Integer 0–30 | Hari kesehatan fisik tidak baik dalam 30 hari terakhir |
| `DiffWalk` | Integer 0–1 | Kesulitan berjalan atau naik tangga |
| `Sex` | Integer 1–2 | 1 laki-laki, 2 perempuan |
| `AgeGroup` | Integer 1–13 | Kode kelompok usia, bukan umur dalam tahun |
| `Education` | Integer 1–4 | 1 belum lulus SMA, 2 lulusan SMA, 3 pernah kuliah/sekolah teknis, 4 lulusan perguruan tinggi |

Semua kategori biner menggunakan 0 = tidak dan 1 = ya. `AgeGroup`: 1 = 18–24, 2 = 25–29, 3 = 30–34, 4 = 35–39, 5 = 40–44, 6 = 45–49, 7 = 50–54, 8 = 55–59, 9 = 60–64, 10 = 65–69, 11 = 70–74, 12 = 75–79, 13 = 80 tahun ke atas.

**Batas BMI 12–100 adalah keputusan operasional prototipe**, bukan batas medis universal dan bukan angka wajib dari soal. Metadata mencatat rentang sampel training sekitar 12.02–99.79; min/max sampel tidak dianggap sebagai batas medis. BMI tidak dibagi dengan 100 lagi. Nilai 3150 tidak valid. `DiabetesStatus`, `DIABETE4`, dan `DIABTYPE` bukan input dan ditolak.

## Endpoint dan respons

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/` | `FileResponse` untuk form HTML |
| GET | `/health` | HTTP 200, `{"status":"ok"}` setelah startup berhasil |
| POST | `/predict` | Validasi 15 fitur, prediksi dan probabilitas tiga kelas |

Kelas: **0 = Tidak diabetes**, **1 = Prediabetes**, **2 = Diabetes**.

Respons `/predict` berisi `class_id` (integer), `prediction` (nama kelas), `probability` (probabilitas kelas yang diprediksi), `probabilities` (objek dengan kunci `Tidak diabetes`, `Prediabetes`, `Diabetes`), dan `disclaimer` (teks). Seluruh probabilitas API memakai skala **0–1**. UI mengalikannya dengan 100 untuk tampilan persen. Kolom probabilitas dipetakan dari `classes_` model, bukan asumsi bahwa semua hasil ada pada indeks 1. Nilai keluaran berasal dari inference model asli.

Error validasi 422 menggunakan detail `loc`, `msg`, dan `type` dari FastAPI/Pydantic. Handler tidak menyalin nilai input atau objek exception ke respons, sehingga input NaN/Infinity tidak menyebabkan error serialisasi. Error inference tak terduga dicatat beserta traceback di log server dan dikembalikan sebagai HTTP 500 dengan pesan umum tanpa path internal.

## Contoh request PowerShell

Jalankan server, lalu buka terminal kedua:

```powershell
$body = @'
{
  "HighBP": 1,
  "HighChol": 1,
  "BMI": 31.5,
  "Smoker": 0,
  "Stroke": 0,
  "HeartDiseaseorAttack": 0,
  "PhysActivity": 1,
  "NoDocbcCost": 0,
  "GenHlth": 3,
  "MentHlth": 0,
  "PhysHlth": 2,
  "DiffWalk": 0,
  "Sex": 1,
  "AgeGroup": 9,
  "Education": 3
}
'@
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health'
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/predict' -Method Post -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 5
```

Contoh input ini juga tersedia di Swagger. Label prediksi tidak ditetapkan manual dari nilai contoh.

## Pengujian

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
```

TestClient memuat pipeline asli untuk pengujian normal dan membandingkan API dengan `predict()` serta `predict_proba()` langsung. Pengujian mencakup batas semua fitur, tipe ketat, field hilang/null/tambahan, JSON rusak, NaN/Infinity, kegagalan startup, error inference, serta pemuatan model sekali. Pengujian model hilang/rusak memakai path sementara tanpa menghapus atau menimpa model asli. Mock hanya digunakan untuk mensimulasikan error atau memastikan inference tidak dipanggil pada input invalid.

Form memiliki tombol Prediksi dan Reset, status proses, tampilan tiga probabilitas, dan pesan error. Selama request berjalan kedua tombol dinonaktifkan agar reset tidak bercampur dengan respons yang masih tertunda. Setelah selesai tombol diaktifkan kembali; reset mengosongkan input, hasil, status, dan error. Pesan ditampilkan menggunakan `textContent`.

Lihat [tabel pengujian aktual](docs/pengujian_backend.md) untuk membedakan pengujian otomatis, pemeriksaan browser, dan bagian yang belum diverifikasi.

## Error umum

- **Python 3.12 tidak ditemukan:** periksa `py --list` dan gunakan instalasi Python 3.12.
- **ModuleNotFoundError:** pastikan pip dan Uvicorn dipanggil dengan Python dari `.venv` yang sama.
- **File model tidak ditemukan / gagal dimuat:** pastikan dua file asli ada di `model/`; pasang `requirements.txt` dan gunakan scikit-learn 1.6.1. Jangan mengganti dengan model lain.
- **HTTP 422:** baca nama field pada detail; pastikan tipe, rentang, kelengkapan, dan nama fitur cocok. Jangan mengirim target.
- **HTTP 500:** periksa log terminal server untuk detail teknis. Pengguna hanya menerima pesan umum.
- **Port 8000 terpakai:** hentikan server sebelumnya milik proyek ini atau gunakan `--port 8001`, lalu buka alamat dengan port yang sama.
- **Form tidak terhubung:** akses melalui alamat Uvicorn, jangan membuka HTML langsung atau melalui Live Server.
- **Penulisan diblokir Controlled Folder Access:** gunakan lokasi proyek yang dapat ditulis, seperti `C:\Projects\proyek-ml-kelompok`. Pengerjaan ini tidak mengubah Windows Security. Buat ulang `.venv` pada lokasi baru.

## Batasan dan responsible use

Probabilitas model bukan accuracy dan bukan kepastian diagnosis. Metadata evaluasi tersimpan melaporkan accuracy 0.677 dan F1 macro 0.4304; angka tersebut adalah hasil evaluasi kelompok, bukan pengukuran ulang backend ini. Sumber dataset pada metadata masih `null`, sehingga asal dataset perlu dilengkapi kelompok dalam laporan. Generalisasi ke populasi baru, kalibrasi probabilitas, dan kelayakan klinis belum diverifikasi.

**Sistem ini merupakan prototipe akademik untuk pembelajaran Machine Learning, bukan alat diagnosis dan bukan pengganti pemeriksaan atau keputusan tenaga kesehatan.** Disclaimer ditampilkan pada halaman dan respons API. Aplikasi tidak memberi saran obat atau klaim diagnosis pasti.

## Pemetaan pekerjaan

| Bagian | Cakupan |
|---|---|
| Langkah 5 | Struktur proyek, pipeline asli, FastAPI, BaseModel dan Field ge/le, health, predict, Uvicorn, pengujian backend |
| Integrasi dasar langkah 6 | HTML/CSS/JS sederhana mengikuti contoh, Fetch tanpa reload, hasil multiclass, validasi/error, disclaimer |
| Di luar pekerjaan ini | Training ulang, audit lengkap tahap 1–4, laporan PDF kelompok, validasi klinis, deployment publik, seluruh skenario end-to-end |

Rujukan teknis implementasi: [validasi ketat Pydantic](https://pydantic.dev/docs/validation/latest/concepts/strict_mode/) dan [penanganan error FastAPI](https://fastapi.tiangolo.com/tutorial/handling-errors/).
