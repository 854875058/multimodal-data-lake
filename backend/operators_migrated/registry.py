# -*- coding: utf-8 -*-
"""Operator registry, metadata catalog and lazy-loading runtime."""

from __future__ import annotations

from dataclasses import dataclass, field
import importlib
import importlib.util
import os
from pathlib import Path
import shutil
from typing import Any, Dict, Iterable, List, Mapping, Sequence

from env_loader import load_local_env_files

ROOT_DIR = Path(__file__).resolve().parents[2]
load_local_env_files(ROOT_DIR)


class OperatorValidationError(ValueError):
    """Raised when operator parameters do not satisfy the declared schema."""

    def __init__(self, errors: Sequence[str]):
        self.errors = [str(item) for item in errors if str(item).strip()]
        super().__init__("; ".join(self.errors))


@dataclass(frozen=True)
class OperatorParameterSpec:
    name: str
    type: str
    description: str
    required: bool = False
    default: Any = None
    example: Any = None
    enum: tuple[str, ...] = ()
    nullable: bool = False
    secret: bool = False


@dataclass(frozen=True)
class OperatorDependencySpec:
    kind: str
    name: str
    check: str = ""
    required: bool = True
    notes: str = ""


@dataclass(frozen=True)
class OperatorExampleSpec:
    name: str
    description: str
    source_path: str
    sink_path: str
    params: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class OperatorSpec:
    key: str
    name: str
    modality: str
    category: str
    status: str
    summary: str
    description: str
    module_path: str
    class_name: str
    runtime: str = "CPU"
    workflow_kind: str = "transform"
    migration_status: str = ""
    input_types: tuple[str, ...] = ()
    output_types: tuple[str, ...] = ()
    usage_steps: tuple[str, ...] = ()
    required_env: tuple[str, ...] = ()
    dependencies: tuple[OperatorDependencySpec, ...] = ()
    parameters: tuple[OperatorParameterSpec, ...] = ()
    examples: tuple[OperatorExampleSpec, ...] = ()
    tags: tuple[str, ...] = ()
    allow_extra_params: bool = True

    @property
    def source_code_path(self) -> str:
        source = ROOT_DIR / Path(self.module_path.replace(".", "/")).with_suffix(".py")
        return str(source.resolve().relative_to(ROOT_DIR.resolve())).replace("\\", "/")


OPERATOR_SPECS: tuple[OperatorSpec, ...] = (
    OperatorSpec(
        key="clean_texts_by_regex",
        name="Text Regex Privacy Cleaner",
        modality="text",
        category="clean",
        status="active",
        summary="Mask common privacy fields in text files with local regex rules.",
        description=(
            "This operator walks a source directory, masks common privacy tokens such as "
            "mobile numbers, email addresses, IP addresses and ID cards, and writes the "
            "cleaned files into the sink directory."
        ),
        module_path="backend.operators_migrated.text.clean.clean_texts_by_regex",
        class_name="CleanTextsByRegexOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="Migrated and runnable in the current repository.",
        input_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        output_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        usage_steps=(
            "Place source text files under source_path. Nested directories are supported.",
            "Set chunk_size when you want to tune chunk splitting during masking.",
            "Run the operator and read cleaned output from sink_path.",
        ),
        parameters=(
            OperatorParameterSpec(
                name="chunk_size",
                type="integer",
                description="Split long text into chunks before masking.",
                default=500,
                example=512,
            ),
            OperatorParameterSpec(
                name="use_ai_detection",
                type="boolean",
                description="Reserved switch from the legacy implementation. The migrated operator currently falls back to regex-only mode.",
                default=False,
                example=False,
            ),
        ),
        examples=(
            OperatorExampleSpec(
                name="Default masking",
                description="Use the built-in defaults for a directory of plain text files.",
                source_path="E:/datasets/raw_texts",
                sink_path="E:/datasets/clean_texts",
                params={"chunk_size": 500},
            ),
        ),
        tags=("privacy", "masking", "text"),
        allow_extra_params=False,
    ),
    OperatorSpec(
        key="normalize_ppt_to_markdown",
        name="PPT to Markdown",
        modality="text",
        category="format",
        status="staged",
        summary="Convert PPT or PPTX decks into Markdown with multimodal model assistance.",
        description=(
            "The source code is present in this repository, but the operator still depends on "
            "legacy clientApp modules, LibreOffice conversion, and model gateway credentials "
            "before it can be executed here."
        ),
        module_path="backend.operators_migrated.staged.text.format.normalize_ppt_to_markdown",
        class_name="NormalizePptToMarkdown",
        runtime="CPU / LLM",
        workflow_kind="transform",
        migration_status="Source migrated, runtime integration still incomplete.",
        input_types=("application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        output_types=("text/markdown",),
        usage_steps=(
            "Populate the PPT2MD_* secrets in .env or process environment.",
            "Install LibreOffice and ensure the soffice executable is available.",
            "Wire the legacy prompt helpers or replace them with repository-local helpers before enabling execution.",
        ),
        required_env=(
            "PPT2MD_APP_ID",
            "PPT2MD_APP_SECRET",
            "PPT2MD_NLPT_AUTHORIZATION",
            "PPT2MD_VL_NLPT_AUTHORIZATION",
        ),
        dependencies=(
            OperatorDependencySpec(kind="legacy_module", name="clientApp", check="clientApp", notes="Legacy prompt and operator base package."),
            OperatorDependencySpec(kind="python_package", name="fitz", check="fitz", notes="PyMuPDF for slide rendering."),
            OperatorDependencySpec(kind="system_binary", name="soffice", check="soffice", notes="LibreOffice headless conversion."),
        ),
        examples=(
            OperatorExampleSpec(
                name="Deck conversion",
                description="Convert a directory of PPT/PPTX files into Markdown outputs.",
                source_path="E:/datasets/ppt_source",
                sink_path="E:/datasets/ppt_markdown",
                params={},
            ),
        ),
        tags=("ppt", "markdown", "multimodal"),
    ),
    OperatorSpec(
        key="enhance_video_privacy_blur_operator",
        name="Video Privacy Blur",
        modality="video",
        category="enhance",
        status="staged",
        summary="Blur privacy-sensitive regions detected in video frames.",
        description=(
            "The migrated source still references legacy clientApp utilities and needs the "
            "final runtime packaging before it can be executed in this repository."
        ),
        module_path="backend.operators_migrated.staged.video.enhance.enhance_video_privacy_blur_operator",
        class_name="EnhanceVideoPrivacyBlurOperator",
        runtime="GPU",
        workflow_kind="transform",
        migration_status="Source migrated, runtime integration still incomplete.",
        input_types=("video/mp4", "video/x-msvideo", "video/quicktime"),
        output_types=("video/mp4",),
        usage_steps=(
            "Install OpenCV and the video processing runtime on the target worker.",
            "Replace legacy clientApp helpers with repository-local utilities.",
            "Attach the operator to a repository-local OCR or text detection service before enabling execution.",
        ),
        dependencies=(
            OperatorDependencySpec(kind="legacy_module", name="clientApp", check="clientApp", notes="Legacy operator base and file helpers."),
            OperatorDependencySpec(kind="python_package", name="cv2", check="cv2", notes="OpenCV video processing."),
            OperatorDependencySpec(kind="python_package", name="numpy", check="numpy", notes="Numerical frame processing."),
            OperatorDependencySpec(kind="system_binary", name="ffmpeg", check="ffmpeg", notes="Video muxing and transcoding."),
        ),
        examples=(
            OperatorExampleSpec(
                name="Privacy blur",
                description="Blur detected text boxes or privacy regions in videos.",
                source_path="E:/datasets/raw_video",
                sink_path="E:/datasets/blurred_video",
                params={},
            ),
        ),
        tags=("video", "privacy", "blur"),
    ),
    OperatorSpec(
        key="enhance_video_redundancy_operator",
        name="Video Redundancy Filter",
        modality="video",
        category="enhance",
        status="staged",
        summary="Drop redundant video frames and optionally preserve meaningful audio segments.",
        description=(
            "The migrated source is present, but the operator still depends on legacy modules "
            "and the final video runtime before it can run in the current repository."
        ),
        module_path="backend.operators_migrated.staged.video.enhance.enhance_video_redundancy_operator",
        class_name="EnhanceVideoRedundancyOperator",
        runtime="GPU",
        workflow_kind="transform",
        migration_status="Source migrated, runtime integration still incomplete.",
        input_types=("video/mp4", "video/x-msvideo", "video/quicktime"),
        output_types=("video/mp4", "application/json"),
        usage_steps=(
            "Install OpenCV and ffmpeg on the target worker.",
            "Replace the legacy operator base and helper imports with repository-local equivalents.",
            "Review frame selection parameters for your video cadence before enabling execution.",
        ),
        dependencies=(
            OperatorDependencySpec(kind="legacy_module", name="clientApp", check="clientApp", notes="Legacy operator base and file helpers."),
            OperatorDependencySpec(kind="python_package", name="cv2", check="cv2", notes="OpenCV video processing."),
            OperatorDependencySpec(kind="python_package", name="numpy", check="numpy", notes="Numerical frame processing."),
            OperatorDependencySpec(kind="system_binary", name="ffmpeg", check="ffmpeg", notes="Video muxing and transcoding."),
        ),
        examples=(
            OperatorExampleSpec(
                name="Redundancy reduction",
                description="Reduce repeated frames in archived video footage.",
                source_path="E:/datasets/raw_video",
                sink_path="E:/datasets/reduced_video",
                params={"active_keep_fps": 24.0},
            ),
        ),
        tags=("video", "redundancy", "sampling"),
    ),
)

_SPEC_BY_KEY = {spec.key: spec for spec in OPERATOR_SPECS}


def _dependency_state(spec: OperatorDependencySpec) -> tuple[str, str]:
    check_target = spec.check or spec.name
    if spec.kind in {"python_package", "legacy_module"}:
        try:
            exists = importlib.util.find_spec(check_target) is not None
        except ModuleNotFoundError:
            exists = False
        return ("available", "") if exists else ("missing", f"{check_target} is not importable")
    if spec.kind == "system_binary":
        binary_path = shutil.which(check_target)
        return ("available", binary_path or "") if binary_path else ("missing", f"{check_target} is not on PATH")
    return "unknown", "automatic check is not implemented"


def _probe_operator_import(spec: OperatorSpec) -> Dict[str, Any]:
    try:
        module = importlib.import_module(spec.module_path)
    except Exception as exc:  # pragma: no cover - exercised through health probing
        missing_module = exc.name if isinstance(exc, ModuleNotFoundError) else ""
        return {
            "ok": False,
            "module_path": spec.module_path,
            "class_name": spec.class_name,
            "error_type": type(exc).__name__,
            "message": str(exc),
            "missing_module": missing_module,
        }

    operator_cls = getattr(module, spec.class_name, None)
    if operator_cls is None:
        return {
            "ok": False,
            "module_path": spec.module_path,
            "class_name": spec.class_name,
            "error_type": "AttributeError",
            "message": f"{spec.class_name} not found in module",
            "missing_module": "",
        }
    return {
        "ok": True,
        "module_path": spec.module_path,
        "class_name": spec.class_name,
        "error_type": "",
        "message": "",
        "missing_module": "",
    }


def _health_state(spec: OperatorSpec) -> Dict[str, Any]:
    missing_env = [name for name in spec.required_env if not os.getenv(name, "").strip()]
    dependency_status = []
    missing_dependencies = []
    for dependency in spec.dependencies:
        state, detail = _dependency_state(dependency)
        dependency_status.append(
            {
                "kind": dependency.kind,
                "name": dependency.name,
                "required": dependency.required,
                "notes": dependency.notes,
                "state": state,
                "detail": detail,
            }
        )
        if dependency.required and state == "missing":
            missing_dependencies.append(dependency.name)

    import_status = _probe_operator_import(spec)
    issues: List[Dict[str, Any]] = []
    if spec.status != "active":
        issues.append(
            {
                "kind": "status",
                "message": "The operator is cataloged but not yet enabled for execution.",
                "items": [spec.migration_status] if spec.migration_status else [],
            }
        )
    if missing_env:
        issues.append(
            {
                "kind": "env",
                "message": "Required environment variables are missing.",
                "items": missing_env,
            }
        )
    if missing_dependencies:
        issues.append(
            {
                "kind": "dependency",
                "message": "Required dependencies are not available in the current runtime.",
                "items": missing_dependencies,
            }
        )
    if not import_status["ok"]:
        issues.append(
            {
                "kind": "import",
                "message": import_status["message"] or "Operator import failed.",
                "items": [import_status["missing_module"]] if import_status["missing_module"] else [],
            }
        )

    if spec.status != "active":
        state = "staged"
    elif missing_env:
        state = "missing_env"
    elif missing_dependencies:
        state = "missing_dependency"
    elif not import_status["ok"]:
        state = "import_error"
    else:
        state = "runnable"

    return {
        "state": state,
        "can_execute": spec.status == "active" and state == "runnable",
        "missing_env": missing_env,
        "missing_dependencies": missing_dependencies,
        "dependency_status": dependency_status,
        "import_status": import_status,
        "issues": issues,
    }


def _parameter_schema_map(parameters: Sequence[OperatorParameterSpec]) -> Dict[str, Dict[str, Any]]:
    schema: Dict[str, Dict[str, Any]] = {}
    for item in parameters:
        schema[item.name] = {
            "type": item.type,
            "description": item.description,
            "required": item.required,
            "default": item.default,
            "example": item.example,
            "enum": list(item.enum),
            "nullable": item.nullable,
            "secret": item.secret,
        }
    return schema


def _parameter_default_map(parameters: Sequence[OperatorParameterSpec]) -> Dict[str, Any]:
    defaults: Dict[str, Any] = {}
    for item in parameters:
        if item.default is not None:
            defaults[item.name] = item.default
    return defaults


def _serialize_parameter(item: OperatorParameterSpec) -> Dict[str, Any]:
    return {
        "name": item.name,
        "type": item.type,
        "description": item.description,
        "required": item.required,
        "default": item.default,
        "example": item.example,
        "enum": list(item.enum),
        "nullable": item.nullable,
        "secret": item.secret,
    }


def _serialize_example(item: OperatorExampleSpec) -> Dict[str, Any]:
    return {
        "name": item.name,
        "description": item.description,
        "source_path": item.source_path,
        "sink_path": item.sink_path,
        "params": dict(item.params),
    }


def _serialize_operator(spec: OperatorSpec, detail: bool = False) -> Dict[str, Any]:
    health = _health_state(spec)
    payload = {
        "key": spec.key,
        "name": spec.name,
        "modality": spec.modality,
        "category": spec.category,
        "status": spec.status,
        "summary": spec.summary,
        "description": spec.description,
        "runtime": spec.runtime,
        "migration_status": spec.migration_status,
        "source_code_path": spec.source_code_path,
        "health": health,
        "params_schema": _parameter_schema_map(spec.parameters),
        "params_count": len(spec.parameters),
        "tags": list(spec.tags),
    }
    if not detail:
        return payload

    payload.update(
        {
            "module_path": spec.module_path,
            "class_name": spec.class_name,
            "input_types": list(spec.input_types),
            "output_types": list(spec.output_types),
            "usage_steps": list(spec.usage_steps),
            "required_env": list(spec.required_env),
            "dependencies": [dict(item) for item in health["dependency_status"]],
            "params": [_serialize_parameter(item) for item in spec.parameters],
            "examples": [_serialize_example(item) for item in spec.examples],
            "allow_extra_params": spec.allow_extra_params,
        }
    )
    return payload


def list_migrated_operators() -> List[Dict[str, Any]]:
    return [_serialize_operator(spec, detail=False) for spec in OPERATOR_SPECS]


def get_operator_or_none(operator_key: str) -> Dict[str, Any] | None:
    spec = _SPEC_BY_KEY.get(operator_key)
    return _serialize_operator(spec, detail=True) if spec else None


def get_operator_spec_or_none(operator_key: str) -> OperatorSpec | None:
    return _SPEC_BY_KEY.get(operator_key)


def get_operator_catalog_summary() -> Dict[str, int]:
    operators = list_migrated_operators()
    return {
        "total": len(operators),
        "active": len([item for item in operators if item["status"] == "active"]),
        "staged": len([item for item in operators if item["status"] == "staged"]),
        "runnable": len([item for item in operators if item["health"]["can_execute"]]),
        "blocked": len([item for item in operators if not item["health"]["can_execute"]]),
    }


def _serialize_workflow_operator(spec: OperatorSpec) -> Dict[str, Any]:
    health = _health_state(spec)
    return {
        "id": spec.key,
        "operator_key": spec.key,
        "label": spec.name,
        "description": spec.summary,
        "kind": spec.workflow_kind,
        "status": spec.status,
        "runtime": spec.runtime,
        "modality": spec.modality,
        "category": spec.category,
        "health": health,
        "params_schema": _parameter_schema_map(spec.parameters),
        "default_params": _parameter_default_map(spec.parameters),
        "input_types": list(spec.input_types),
        "output_types": list(spec.output_types),
        "source_code_path": spec.source_code_path,
        "tags": list(spec.tags),
    }


def list_workflow_operators() -> List[Dict[str, Any]]:
    operators = [_serialize_workflow_operator(spec) for spec in OPERATOR_SPECS]
    return sorted(
        operators,
        key=lambda item: (
            0 if item["health"]["can_execute"] else 1,
            item["modality"],
            item["label"].lower(),
        ),
    )


def get_workflow_operator_or_none(operator_key: str) -> Dict[str, Any] | None:
    spec = _SPEC_BY_KEY.get(operator_key)
    return _serialize_workflow_operator(spec) if spec else None


def _coerce_boolean(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "y", "on"}:
            return True
        if normalized in {"0", "false", "no", "n", "off"}:
            return False
    if isinstance(value, (int, float)) and value in {0, 1}:
        return bool(value)
    raise ValueError("must be a boolean")


def _coerce_value(spec: OperatorParameterSpec, value: Any) -> Any:
    if value is None:
        if spec.nullable:
            return None
        raise ValueError("cannot be null")

    if spec.type == "string":
        return str(value)
    if spec.type == "integer":
        if isinstance(value, bool):
            raise ValueError("must be an integer")
        return int(value)
    if spec.type == "number":
        if isinstance(value, bool):
            raise ValueError("must be a number")
        return float(value)
    if spec.type == "boolean":
        return _coerce_boolean(value)
    if spec.type == "array":
        if not isinstance(value, list):
            raise ValueError("must be an array")
        return list(value)
    if spec.type == "object":
        if not isinstance(value, dict):
            raise ValueError("must be an object")
        return dict(value)
    return value


def validate_operator_params(operator_key: str, payload: Mapping[str, Any] | None) -> Dict[str, Any]:
    spec = get_operator_spec_or_none(operator_key)
    if spec is None:
        raise KeyError(operator_key)

    incoming = dict(payload or {})
    validated: Dict[str, Any] = {}
    errors: List[str] = []
    declared_names = {item.name for item in spec.parameters}

    for parameter in spec.parameters:
        if parameter.name in incoming:
            raw_value = incoming.pop(parameter.name)
        elif parameter.default is not None or not parameter.required:
            raw_value = parameter.default
        else:
            errors.append(f"param `{parameter.name}` is required")
            continue

        if raw_value is None and parameter.default is None and not parameter.required:
            validated[parameter.name] = None
            continue

        try:
            value = _coerce_value(parameter, raw_value)
        except Exception as exc:
            errors.append(f"param `{parameter.name}` {exc}")
            continue

        if parameter.enum and value not in parameter.enum:
            errors.append(f"param `{parameter.name}` must be one of: {', '.join(parameter.enum)}")
            continue
        validated[parameter.name] = value

    if not spec.allow_extra_params:
        extra_params = sorted(name for name in incoming if name not in declared_names)
        if extra_params:
            errors.append(f"unexpected params: {', '.join(extra_params)}")
    else:
        validated.update(incoming)

    if errors:
        raise OperatorValidationError(errors)
    return validated


def build_operator_instance(operator_key: str):
    spec = get_operator_spec_or_none(operator_key)
    if spec is None:
        return None

    module = importlib.import_module(spec.module_path)
    operator_cls = getattr(module, spec.class_name, None)
    if operator_cls is None:
        return None
    operator = operator_cls()
    if not hasattr(operator, "process"):
        return None
    return operator


def iter_operator_specs() -> Iterable[OperatorSpec]:
    return iter(OPERATOR_SPECS)
