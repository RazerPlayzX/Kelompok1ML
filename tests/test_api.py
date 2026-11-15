"""Integrasi normal memakai model asli; mock hanya untuk error/observasi panggilan."""

import json
from unittest.mock import Mock

import joblib
import numpy as np
import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app as api


@pytest.fixture(scope="module")
def client():
    with TestClient(api.app) as connection:
        yield connection


@pytest.fixture(scope="module")
def direct_model():
    return joblib.load(api.MODEL_PATH)


@pytest.fixture
def no_inference(client, monkeypatch):
    predict = Mock(side_effect=AssertionError("Input invalid mencapai model"))
    proba = Mock(side_effect=AssertionError("Input invalid mencapai model"))
    monkeypatch.setattr(api.app.state.model, "predict", predict)
    monkeypatch.setattr(api.app.state.model, "predict_proba", proba)
    yield
    predict.assert_not_called()
    proba.assert_not_called()


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_home(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "SehatCheck" in response.text
    assert "Bukan alat diagnosis medis" in response.text


@pytest.mark.parametrize("asset,content_type", [
    ("style.css", "text/css"), ("app.js", "javascript"),
])
def test_static_assets(client, asset, content_type):
    response = client.get(f"/static/{asset}")
    assert response.status_code == 200
    assert content_type in response.headers["content-type"]
    assert response.content


def test_swagger_example(client):
    assert client.get("/docs").status_code == 200
    schema = client.get("/openapi.json").json()["components"]["schemas"]["DiabetesInput"]
    assert schema["examples"][0] == api.EXAMPLE
    assert set(schema["required"]) == set(api.FEATURES)
    assert schema["additionalProperties"] is False


@pytest.mark.parametrize("changes", [
    {}, {"BMI": 12}, {"BMI": 100}, {"BMI": 31},
    {"MentHlth": 30, "PhysHlth": 30, "GenHlth": 5, "AgeGroup": 13, "Education": 4, "Sex": 2},
    {"HighBP": 0, "HighChol": 0, "BMI": 20.5, "AgeGroup": 1, "GenHlth": 1, "Education": 1},
])
def test_prediction_matches_original(client, direct_model, changes):
    payload = {**api.EXAMPLE, **changes}
    # JSON key order may differ; backend must restore training feature order.
    response = client.post("/predict", json=dict(reversed(list(payload.items()))))
    assert response.status_code == 200, response.text
    result = response.json()
    row = pd.DataFrame([payload], columns=list(direct_model.feature_names_in_))
    expected_class = int(direct_model.predict(row)[0])
    expected_probabilities = {
        api.LABELS[int(code)]: float(score)
        for code, score in zip(direct_model.classes_, direct_model.predict_proba(row)[0])
    }
    assert type(result["class_id"]) is int
    assert result["class_id"] == expected_class
    assert result["prediction"] == api.LABELS[expected_class]
    assert result["probabilities"] == pytest.approx(expected_probabilities)
    assert result["probability"] == pytest.approx(expected_probabilities[result["prediction"]])
    assert set(result["probabilities"]) == set(api.LABELS.values())
    assert all(0 <= probability <= 1 for probability in result["probabilities"].values())
    assert sum(result["probabilities"].values()) == pytest.approx(1.0)
    assert result["disclaimer"] == api.DISCLAIMER


LIMITS = {
    "HighBP": (0, 1), "HighChol": (0, 1), "BMI": (12, 100),
    "Smoker": (0, 1), "Stroke": (0, 1), "HeartDiseaseorAttack": (0, 1),
    "PhysActivity": (0, 1), "NoDocbcCost": (0, 1), "GenHlth": (1, 5),
    "MentHlth": (0, 30), "PhysHlth": (0, 30), "DiffWalk": (0, 1),
    "Sex": (1, 2), "AgeGroup": (1, 13), "Education": (1, 4),
}


@pytest.mark.parametrize("field,value", [
    (field, value) for field, (low, high) in LIMITS.items() for value in (low - 1, high + 1)
])
def test_out_of_range(client, no_inference, field, value):
    response = client.post("/predict", json={**api.EXAMPLE, field: value})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]


@pytest.mark.parametrize("field", api.FEATURES)
def test_missing_field(client, no_inference, field):
    payload = api.EXAMPLE.copy()
    del payload[field]
    assert client.post("/predict", json=payload).status_code == 422


@pytest.mark.parametrize("field", api.FEATURES)
@pytest.mark.parametrize("value", [None, True, False, "1", "invalid", [], {}])
def test_invalid_type(client, no_inference, field, value):
    assert client.post("/predict", json={**api.EXAMPLE, field: value}).status_code == 422


@pytest.mark.parametrize("field", [field for field in api.FEATURES if field != "BMI"])
@pytest.mark.parametrize("value", [1.0, 1.5])
def test_integer_fields_reject_floats(client, no_inference, field, value):
    assert client.post("/predict", json={**api.EXAMPLE, field: value}).status_code == 422


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_non_finite_bmi(client, no_inference, value):
    # Deliberately send nonstandard JSON tokens to verify a safe 422 response.
    response = client.post("/predict", content=json.dumps({**api.EXAMPLE, "BMI": value}),
                           headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    assert response.json()["detail"]


@pytest.mark.parametrize("field", ["DiabetesStatus", "DIABETE4", "DIABTYPE", "extra"])
def test_extra_field(client, no_inference, field):
    assert client.post("/predict", json={**api.EXAMPLE, field: 1}).status_code == 422


@pytest.mark.parametrize("body", ['{"BMI":', "not json", "[]", "null"])
def test_malformed_or_wrong_body(client, no_inference, body):
    response = client.post("/predict", content=body, headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    assert response.json()["detail"]


def test_missing_model_stops_startup(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "MODEL_PATH", tmp_path / "missing.joblib")
    isolated = FastAPI(lifespan=api.lifespan)
    with pytest.raises(RuntimeError, match="File model tidak ditemukan"):
        with TestClient(isolated):
            pytest.fail("Startup tidak boleh berhasil")
    assert not hasattr(isolated.state, "model")


def test_corrupt_model_stops_startup(tmp_path, monkeypatch):
    broken = tmp_path / "broken.joblib"
    broken.write_bytes(b"not a joblib pipeline")
    monkeypatch.setattr(api, "MODEL_PATH", broken)
    isolated = FastAPI(lifespan=api.lifespan)
    with pytest.raises(RuntimeError, match="Gagal memuat model diabetes"):
        with TestClient(isolated):
            pytest.fail("Startup tidak boleh berhasil")
    assert not hasattr(isolated.state, "model")


def test_model_loaded_once(monkeypatch):
    loader = Mock(wraps=joblib.load)
    monkeypatch.setattr(api.joblib, "load", loader)
    # Isolated application with the same routes and startup; use its own state.
    isolated = FastAPI(lifespan=api.lifespan)
    isolated.add_api_route("/predict", api.predict, methods=["POST"])
    monkeypatch.setattr(api, "app", isolated)
    with TestClient(isolated) as connection:
        for _ in range(2):
            assert connection.post("/predict", json=api.EXAMPLE).status_code == 200
        assert loader.call_count == 1


def test_inference_error_is_generic(client, monkeypatch, caplog):
    monkeypatch.setattr(api.app.state.model, "predict", Mock(side_effect=RuntimeError("PRIVATE_PATH")))
    response = client.post("/predict", json=api.EXAMPLE)
    assert response.status_code == 500
    assert response.json() == {"detail": "Prediksi gagal diproses. Silakan coba lagi nanti."}
    assert "PRIVATE_PATH" not in response.text
    assert "PRIVATE_PATH" in caplog.text


def test_probability_mapping_follows_classes(client, direct_model):
    # Reorder real model outputs to exercise mapping independently of class order.
    order = np.array([2, 0, 1])

    class ReorderedOutputs:
        classes_ = direct_model.classes_[order]

        def predict(self, row):
            return direct_model.predict(row)

        def predict_proba(self, row):
            return direct_model.predict_proba(row)[:, order]

    baseline = client.post("/predict", json=api.EXAMPLE).json()
    original_model = api.app.state.model
    try:
        api.app.state.model = ReorderedOutputs()
        response = client.post("/predict", json=api.EXAMPLE)
        assert response.status_code == 200
        assert response.json() == baseline
    finally:
        # State menyimpan atribut secara dinamis; pulihkan objek asli secara eksplisit.
        api.app.state.model = original_model
