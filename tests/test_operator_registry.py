# -*- coding: utf-8 -*-

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.operators.registry import (
    OperatorValidationError,
    build_operator_instance,
    get_operator_catalog_summary,
    get_operator_or_none,
    list_migrated_operators,
    validate_operator_params,
)


def test_operator_catalog_exposes_health_and_summary():
    operators = list_migrated_operators()
    assert operators
    assert any(item["key"] == "clean_texts_by_regex" for item in operators)
    assert all("health" in item for item in operators)

    summary = get_operator_catalog_summary()
    assert summary["total"] == len(operators)
    assert summary["runnable"] >= 1
    assert summary["blocked"] >= 1


def test_active_operator_detail_is_runnable_and_has_parameter_schema():
    detail = get_operator_or_none("clean_texts_by_regex")
    assert detail is not None
    assert detail["health"]["can_execute"] is True
    assert detail["health"]["state"] == "runnable"
    assert detail["params_schema"]["chunk_size"]["default"] == 500
    assert detail["usage_steps"]


def test_staged_operator_reports_missing_legacy_module_or_staged_status():
    detail = get_operator_or_none("normalize_ppt_to_markdown")
    assert detail is not None
    assert detail["health"]["can_execute"] is False
    assert detail["health"]["state"] == "staged"
    import_issue = next((item for item in detail["health"]["issues"] if item["kind"] == "import"), None)
    assert import_issue is not None
    assert "clientApp" in " ".join(import_issue.get("items") or []) or "clientApp" in import_issue.get("message", "")


def test_validate_operator_params_applies_defaults_and_rejects_invalid_values():
    normalized = validate_operator_params("clean_texts_by_regex", {"chunk_size": "256"})
    assert normalized["chunk_size"] == 256
    assert normalized["use_ai_detection"] is False

    try:
        validate_operator_params("clean_texts_by_regex", {"chunk_size": "bad-value"})
    except OperatorValidationError as exc:
        assert "chunk_size" in str(exc)
    else:  # pragma: no cover - defensive
        raise AssertionError("expected OperatorValidationError")

    try:
        validate_operator_params("clean_texts_by_regex", {"unexpected": True})
    except OperatorValidationError as exc:
        assert "unexpected params" in str(exc)
    else:  # pragma: no cover - defensive
        raise AssertionError("expected OperatorValidationError for unexpected params")


def test_build_operator_instance_for_active_operator():
    operator = build_operator_instance("clean_texts_by_regex")
    assert operator is not None
    assert hasattr(operator, "process")
