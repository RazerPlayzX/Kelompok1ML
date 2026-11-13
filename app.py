"""REST API sederhana untuk pipeline klasifikasi status diabetes kelompok 1."""

from contextlib import asynccontextmanager
import json
import logging
from pathlib import Path
from typing import Annotated, Literal

import joblib
import pandas as pd
import sklearn
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model" / "model_kelompok_1.joblib"
INFO_PATH = BASE_DIR / "model" / "model_info.json"
FEATURES = [
    "HighBP", "HighChol", "BMI", "Smoker", "Stroke", "HeartDiseaseorAttack",
    "PhysActivity", "NoDocbcCost", "GenHlth", "MentHlth", "PhysHlth",
    "DiffWalk", "Sex", "AgeGroup", "Education",
]
LABELS = {0: "Tidak diabetes", 1: "Prediabetes", 2: "Diabetes"}
DISCLAIMER = (
    "Sistem ini merupakan prototipe akademik untuk pembelajaran Machine Learning, "
    "bukan alat diagnosis dan bukan pengganti pemeriksaan atau keputusan tenaga kesehatan."
)
EXAMPLE = {
    "HighBP": 1, "HighChol": 1, "BMI": 31.5, "Smoker": 0, "Stroke": 0,
    "HeartDiseaseorAttack": 0, "PhysActivity": 1, "NoDocbcCost": 0,
    "GenHlth": 3, "MentHlth": 0, "PhysHlth": 2, "DiffWalk": 0,
    "Sex": 1, "AgeGroup": 9, "Education": 3,
}
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI):
    if not MODEL_PATH.is_file():
        raise RuntimeError(
            "File model tidak ditemukan. Salin model_kelompok_1.joblib asli ke folder model/."
        )
    try:
        info = json.loads(INFO_PATH.read_text(encoding="utf-8"))
        if sklearn.__version__ != "1.6.1" or info["sklearn_version"] != "1.6.1":
            raise ValueError("Gunakan scikit-learn==1.6.1 sesuai metadata model.")
        if info["urutan_fitur"] != FEATURES or info["target"] != "DiabetesStatus":
            raise ValueError("Kontrak fitur/target model_info.json tidak cocok.")
        if info["kelas"] != {str(key): value for key, value in LABELS.items()}:
            raise ValueError("Label kelas model_info.json tidak cocok.")
        # Satu kali saat startup; pipeline sudah berisi seluruh preprocessing.
        model = joblib.load(MODEL_PATH)
        if list(model.feature_names_in_) != FEATURES:
            raise ValueError("Nama atau urutan fitur model tidak cocok dengan kontrak API.")
        if len(model.classes_) != 3 or set(model.classes_) != set(LABELS):
            raise ValueError("Kelas model harus 0, 1, dan 2.")
        if not callable(getattr(model, "predict_proba", None)):
            raise ValueError("Model tidak menyediakan probabilitas kelas.")
    except Exception as exc:
        raise RuntimeError(
            f"Gagal memuat model diabetes. Periksa file model, metadata, dan dependensi: {exc}"
        ) from exc
    application.state.model = model
    yield
    del application.state.model


app = FastAPI(
    title="Screening Awal Status Diabetes",
    description="REST API prototipe akademik kelompok 1. " + DISCLAIMER,
    version="1.0.0",
    lifespan=lifespan,
)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


class DiabetesInput(BaseModel):
    model_config = ConfigDict(
        extra="forbid", strict=True, json_schema_extra={"examples": [EXAMPLE]}
    )

    HighBP: int = Field(ge=0, le=1, description="Riwayat tekanan darah tinggi: 0 tidak, 1 ya")
    HighChol: int = Field(ge=0, le=1, description="Riwayat kolesterol tinggi: 0 tidak, 1 ya")
    BMI: float = Field(ge=12.0, le=100.0, allow_inf_nan=False, description="BMI hasil cleaning, misalnya 31.5; batas operasional prototipe")
    Smoker: int = Field(ge=0, le=1, description="Pernah merokok minimal 100 batang sepanjang hidup: 0 tidak, 1 ya")
    Stroke: int = Field(ge=0, le=1, description="Riwayat stroke: 0 tidak, 1 ya")
    HeartDiseaseorAttack: int = Field(ge=0, le=1, description="Riwayat penyakit jantung koroner/serangan jantung: 0 tidak, 1 ya")
    PhysActivity: int = Field(ge=0, le=1, description="Aktivitas fisik di luar pekerjaan dalam sebulan terakhir: 0 tidak, 1 ya")
    NoDocbcCost: int = Field(ge=0, le=1, description="Pernah terkendala biaya mengakses dokter: 0 tidak, 1 ya")
    GenHlth: int = Field(ge=1, le=5, description="Kesehatan umum: 1 sangat baik sekali, 2 sangat baik, 3 baik, 4 cukup, 5 buruk")
    MentHlth: int = Field(ge=0, le=30, description="Hari kesehatan mental tidak baik dalam 30 hari terakhir")
    PhysHlth: int = Field(ge=0, le=30, description="Hari kesehatan fisik tidak baik dalam 30 hari terakhir")
    DiffWalk: int = Field(ge=0, le=1, description="Kesulitan berjalan/naik tangga: 0 tidak, 1 ya")
    Sex: int = Field(ge=1, le=2, description="1 laki-laki, 2 perempuan")
    AgeGroup: int = Field(ge=1, le=13, description="Kode kelompok usia 1-13, bukan umur dalam tahun; lihat form/README")
    Education: int = Field(ge=1, le=4, description="1 belum lulus SMA, 2 lulusan SMA, 3 pernah kuliah/sekolah teknis, 4 lulusan perguruan tinggi")


Probability = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
ClassName = Literal["Tidak diabetes", "Prediabetes", "Diabetes"]


class PredictionResponse(BaseModel):
    class_id: Literal[0, 1, 2]
    prediction: ClassName
    probability: Probability
    probabilities: dict[ClassName, Probability]
    disclaimer: str


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError):
    # Pertahankan detail Pydantic tanpa menyalin input NaN/Infinity atau ctx
    # berisi exception ke JSONResponse (keduanya bisa gagal diserialisasi).
    details = [
        {"loc": error["loc"], "msg": error["msg"], "type": error["type"]}
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": details})


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict", response_model=PredictionResponse)
def predict(payload: DiabetesInput):
    try:
        row = pd.DataFrame([payload.model_dump()], columns=FEATURES)
        model = app.state.model
        class_id = int(model.predict(row)[0])
        scores = model.predict_proba(row)[0]
        # Posisi kolom predict_proba mengikuti classes_, bukan indeks label tetap.
        probabilities = {
            LABELS[int(class_code)]: float(score)
            for class_code, score in zip(model.classes_, scores, strict=True)
        }
        return PredictionResponse(
            class_id=class_id,
            prediction=LABELS[class_id],
            probability=probabilities[LABELS[class_id]],
            probabilities=probabilities,
            disclaimer=DISCLAIMER,
        )
    except Exception:
        logger.exception("Inference model diabetes gagal")
        raise HTTPException(
            status_code=500, detail="Prediksi gagal diproses. Silakan coba lagi nanti."
        ) from None
