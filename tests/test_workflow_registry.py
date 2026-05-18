# -*- coding: utf-8 -*-
"""Workflow registry integration tests."""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


@pytest.fixture(scope="module")
def client():
    from backend.main import app

    return TestClient(app)


def test_workflow_presets_are_projected_from_operator_registry(client):
    response = client.get("/api/platform/workflow/presets")

    assert response.status_code == 200
    payload = response.json()
    library = payload["library"]
    assert library
    assert any(item["id"] == "clean_texts_by_regex" for item in library)
    assert not any(item["id"] == "clean_text" for item in library)

    clean_text = next(item for item in library if item["id"] == "clean_texts_by_regex")
    assert clean_text["default_params"]["chunk_size"] == 500
    assert clean_text["health"]["can_execute"] is True

    runnable_preset = next(item for item in payload["presets"] if item["id"] == "text_privacy_pipeline")
    assert runnable_preset["nodes"] == ["clean_texts_by_regex"]
    assert runnable_preset["execution_ready"] is True

    blocked_preset = next(item for item in payload["presets"] if item["id"] == "ppt_cleanup_pipeline")
    assert blocked_preset["execution_ready"] is False
    assert any(node["id"] == "normalize_ppt_to_markdown" for node in blocked_preset["blocked_nodes"])


def test_build_job_reports_readiness_and_blocked_nodes(client):
    runnable_response = client.post(
        "/api/platform/workflow/build-job",
        json={
            "name": "text_preview",
            "nodes": ["clean_texts_by_regex"],
            "cpu": 4,
            "gpu": 0,
            "memory_gb": 16,
            "source_hint": "/datasets/text",
        },
    )

    assert runnable_response.status_code == 200
    runnable_payload = runnable_response.json()["data"]
    assert runnable_payload["execution_ready"] is True
    assert runnable_payload["node_details"][0]["id"] == "clean_texts_by_regex"
    assert runnable_payload["runtime_env"]["env_vars"]["WORKFLOW_OPERATORS"] == "clean_texts_by_regex"

    blocked_response = client.post(
        "/api/platform/workflow/build-job",
        json={
            "name": "ppt_preview",
            "nodes": ["normalize_ppt_to_markdown"],
            "cpu": 4,
            "gpu": 0,
            "memory_gb": 16,
        },
    )

    assert blocked_response.status_code == 200
    blocked_payload = blocked_response.json()["data"]
    assert blocked_payload["execution_ready"] is False
    assert blocked_payload["blocked_nodes"][0]["id"] == "normalize_ppt_to_markdown"


def test_build_job_rejects_unknown_nodes(client):
    response = client.post(
        "/api/platform/workflow/build-job",
        json={"name": "bad_preview", "nodes": ["clean_text"]},
    )

    assert response.status_code == 400
    assert "unknown workflow operators" in response.json()["detail"]
