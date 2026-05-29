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

from backend.core.env_loader import load_local_env_files

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
    # === 可运行算子 ===
    OperatorSpec(
        key="clean_texts_by_regex",
        name="正则隐私脱敏",
        modality="text",
        category="clean",
        status="active",
        summary="使用正则表达式对文本中的手机号、邮箱、身份证号等隐私字段进行脱敏。",
        description=(
            "遍历源目录中的文本文件，使用正则规则匹配手机号、邮箱、IP 地址、"
            "座机号、身份证号和邮编等隐私字段，进行差异化掩码处理后写入目标目录。"
        ),
        module_path="backend.operators.text.clean.clean_texts_by_regex",
        class_name="CleanTextsByRegexOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        output_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        usage_steps=(
            "将待脱敏的文本文件放入源目录，支持嵌套子目录。",
            "可调整 chunk_size 参数控制切片大小。",
            "运行算子后从目标目录读取脱敏结果。",
        ),
        parameters=(
            OperatorParameterSpec(
                name="chunk_size",
                type="integer",
                description="脱敏前将长文本按此长度切片处理",
                default=500,
                example=512,
            ),
            OperatorParameterSpec(
                name="use_ai_detection",
                type="boolean",
                description="是否启用 AI 辅助检测（当前版本仅支持正则模式）",
                default=False,
                example=False,
            ),
        ),
        examples=(
            OperatorExampleSpec(
                name="默认脱敏",
                description="使用默认参数对文本目录进行隐私脱敏。",
                source_path="E:/datasets/raw_texts",
                sink_path="E:/datasets/clean_texts",
                params={"chunk_size": 500},
            ),
        ),
        tags=("隐私", "脱敏", "文本"),
        allow_extra_params=False,
    ),
    OperatorSpec(
        key="split_text_by_length",
        name="文本按长度切分",
        modality="text",
        category="split",
        status="active",
        summary="将长文本按指定字符数切分为多个片段，支持重叠区间。",
        description=(
            "遍历源目录中的文本文件，按指定的 chunk_size 切分为多段，"
            "每段生成独立文件，支持 overlap 重叠以保留上下文连贯性。"
        ),
        module_path="backend.operators.text.split.split_text_by_length",
        class_name="SplitTextByLengthOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        output_types=("text/plain", "text/markdown"),
        usage_steps=(
            "将待切分的文本文件放入源目录。",
            "设置 chunk_size 控制每段长度，设置 overlap 控制重叠字符数。",
            "运行算子后从目标目录读取切分结果。",
        ),
        parameters=(
            OperatorParameterSpec(
                name="chunk_size",
                type="integer",
                description="每段文本的最大字符数",
                default=500,
                example=1000,
            ),
            OperatorParameterSpec(
                name="overlap",
                type="integer",
                description="相邻段之间的重叠字符数",
                default=50,
                example=100,
            ),
        ),
        examples=(
            OperatorExampleSpec(
                name="按 1000 字切分",
                description="将文本按 1000 字符切分，重叠 100 字符。",
                source_path="E:/datasets/long_texts",
                sink_path="E:/datasets/split_texts",
                params={"chunk_size": 1000, "overlap": 100},
            ),
        ),
        tags=("切分", "文本", "预处理"),
    ),
    OperatorSpec(
        key="deduplicate_by_hash",
        name="哈希去重",
        modality="text",
        category="dedup",
        status="active",
        summary="对文本文件按内容哈希去重，保留首次出现的文件。",
        description=(
            "遍历源目录中的文本文件，计算内容哈希值（支持 MD5/SHA256），"
            "跳过内容重复的文件，仅保留首次出现的副本。"
        ),
        module_path="backend.operators.text.dedup.deduplicate_by_hash",
        class_name="DeduplicateByHashOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        output_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        usage_steps=(
            "将待去重的文件放入源目录。",
            "选择哈希算法（md5 或 sha256）。",
            "运行算子后从目标目录读取去重结果。",
        ),
        parameters=(
            OperatorParameterSpec(
                name="algorithm",
                type="string",
                description="哈希算法",
                default="md5",
                example="md5",
                enum=("md5", "sha256"),
            ),
        ),
        examples=(
            OperatorExampleSpec(
                name="MD5 去重",
                description="使用 MD5 算法对文本文件去重。",
                source_path="E:/datasets/raw_texts",
                sink_path="E:/datasets/deduped_texts",
                params={"algorithm": "md5"},
            ),
        ),
        tags=("去重", "哈希", "文本"),
    ),
    OperatorSpec(
        key="convert_csv_to_json",
        name="CSV 转 JSON",
        modality="text",
        category="convert",
        status="active",
        summary="将 CSV 文件逐行转为 JSON 数组文件。",
        description=(
            "遍历源目录中的 CSV 文件，使用 csv.DictReader 逐行读取，"
            "转换为 JSON 数组格式写入目标目录，非 CSV 文件直接拷贝。"
        ),
        module_path="backend.operators.text.convert.convert_csv_to_json",
        class_name="ConvertCsvToJsonOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("text/csv",),
        output_types=("application/json",),
        usage_steps=(
            "将 CSV 文件放入源目录。",
            "设置文件编码（默认 utf-8）。",
            "运行算子后从目标目录读取 JSON 结果。",
        ),
        parameters=(
            OperatorParameterSpec(
                name="encoding",
                type="string",
                description="CSV 文件编码",
                default="utf-8",
                example="utf-8",
                enum=("utf-8", "gbk", "gb2312", "latin-1"),
            ),
        ),
        examples=(
            OperatorExampleSpec(
                name="UTF-8 CSV 转 JSON",
                description="将 UTF-8 编码的 CSV 转为 JSON。",
                source_path="E:/datasets/csv_files",
                sink_path="E:/datasets/json_files",
                params={"encoding": "utf-8"},
            ),
        ),
        tags=("转换", "CSV", "JSON"),
    ),
    OperatorSpec(
        key="filter_by_keyword",
        name="关键词过滤",
        modality="text",
        category="filter",
        status="active",
        summary="按关键词筛选文本文件，保留或排除包含指定关键词的文件。",
        description=(
            "遍历源目录中的文本文件，检查内容是否包含指定关键词，"
            "根据 include/exclude 模式决定保留或排除匹配文件。"
        ),
        module_path="backend.operators.text.filter.filter_by_keyword",
        class_name="FilterByKeywordOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        output_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        usage_steps=(
            "将待过滤的文件放入源目录。",
            "设置关键词列表和过滤模式（include 保留匹配 / exclude 排除匹配）。",
            "运行算子后从目标目录读取过滤结果。",
        ),
        parameters=(
            OperatorParameterSpec(
                name="keywords",
                type="array",
                description="关键词列表",
                default=["示例"],
                example=["数据", "AI"],
            ),
            OperatorParameterSpec(
                name="mode",
                type="string",
                description="过滤模式：include 保留匹配文件，exclude 排除匹配文件",
                default="include",
                example="include",
                enum=("include", "exclude"),
            ),
        ),
        examples=(
            OperatorExampleSpec(
                name="保留含关键词的文件",
                description='仅保留包含"数据"或"AI"的文件。',
                source_path="E:/datasets/all_texts",
                sink_path="E:/datasets/filtered_texts",
                params={"keywords": ["数据", "AI"], "mode": "include"},
            ),
        ),
        tags=("过滤", "关键词", "文本"),
    ),
    OperatorSpec(
        key="merge_small_files",
        name="小文件合并",
        modality="file",
        category="merge",
        status="active",
        summary="将多个小文本文件合并为单个文件。",
        description=(
            "遍历源目录，将小于指定大小的文本文件合并为一个输出文件，"
            "大文件和非文本文件直接拷贝到目标目录。"
        ),
        module_path="backend.operators.file.merge_small_files",
        class_name="MergeSmallFilesOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        output_types=("text/plain",),
        usage_steps=(
            "将待合并的小文件放入源目录。",
            "设置 max_size_kb 控制合并阈值，设置 separator 控制分隔符。",
            "运行算子后从目标目录读取合并结果。",
        ),
        parameters=(
            OperatorParameterSpec(
                name="max_size_kb",
                type="integer",
                description="文件大小阈值（KB），低于此大小的文件将被合并",
                default=10,
                example=50,
            ),
            OperatorParameterSpec(
                name="separator",
                type="string",
                description="合并时的文件分隔符",
                default="\n---\n",
                example="\n===\n",
            ),
        ),
        examples=(
            OperatorExampleSpec(
                name="合并小文件",
                description="将小于 10KB 的文件合并。",
                source_path="E:/datasets/small_files",
                sink_path="E:/datasets/merged",
                params={"max_size_kb": 10},
            ),
        ),
        tags=("合并", "小文件", "文件"),
    ),
    OperatorSpec(
        key="extract_text_metadata",
        name="元数据提取",
        modality="file",
        category="extract",
        status="active",
        summary="从文件中提取基础元数据（大小、行数、字符数、类型等）。",
        description=(
            "遍历源目录中的所有文件，提取文件名、大小、扩展名、是否为文本等元数据，"
            "文本文件额外提取行数、字符数、词数和空行数，输出为 JSON 格式。"
        ),
        module_path="backend.operators.file.extract_text_metadata",
        class_name="ExtractTextMetadataOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        output_types=("application/json",),
        usage_steps=(
            "将待分析的文件放入源目录。",
            "运行算子后从目标目录读取元数据 JSON 文件。",
        ),
        parameters=(),
        examples=(
            OperatorExampleSpec(
                name="提取文本元数据",
                description="提取目录中所有文件的元数据。",
                source_path="E:/datasets/texts",
                sink_path="E:/datasets/metadata",
                params={},
            ),
        ),
        tags=("元数据", "分析", "文件"),
    ),
    # === 文档解析算子 ===
    OperatorSpec(
        key="normalize_ppt_to_markdown",
        name="文档转 Markdown",
        modality="text",
        category="format",
        status="active",
        summary="将 PPT/PPTX/PDF 文档转换为 Markdown 格式（基于 MinerU）。",
        description=(
            "基于 MinerU (magic-pdf) 的版面分析能力，支持 PPT/PPTX/PDF 转 Markdown。"
            "PPT 文件需要 LibreOffice 转 PDF 后再解析，PDF 可直接解析。"
        ),
        module_path="backend.operators.text.format.normalize_ppt_to_markdown",
        class_name="NormalizePptToMarkdown",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，基于 MinerU 重写，可直接运行。",
        input_types=(
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/pdf",
        ),
        output_types=("text/markdown",),
        usage_steps=(
            "将 PPT/PPTX/PDF 文件放入源目录。",
            "可选参数：enable_ocr 启用 OCR 识别。",
            "运行算子后从目标目录读取 Markdown 结果。",
        ),
        parameters=(
            OperatorParameterSpec(
                name="enable_ocr",
                type="boolean",
                description="是否启用 OCR 识别（对扫描件 PDF 有效）",
                default=False,
                example=False,
            ),
            OperatorParameterSpec(
                name="batch_size",
                type="integer",
                description="批处理大小",
                default=5,
                example=10,
            ),
        ),
        examples=(
            OperatorExampleSpec(
                name="文档转换",
                description="将 PPT/PDF 文件目录转换为 Markdown 输出。",
                source_path="E:/datasets/documents",
                sink_path="E:/datasets/markdown",
                params={},
            ),
        ),
        tags=("PPT", "PDF", "Markdown", "文档解析"),
    ),
    OperatorSpec(
        key="enhance_video_privacy_blur_operator",
        name="视频隐私模糊",
        modality="video",
        category="enhance",
        status="staged",
        summary="对视频帧中检测到的隐私敏感区域进行模糊处理。",
        description=(
            "迁移的源码仍引用遗留 clientApp 工具，需要完成最终运行时打包"
            "后才能在当前仓库执行。"
        ),
        module_path="backend.operators.staged.video.enhance.enhance_video_privacy_blur_operator",
        class_name="EnhanceVideoPrivacyBlurOperator",
        runtime="GPU",
        workflow_kind="transform",
        migration_status="源码已迁移，运行时集成未完成。",
        input_types=("video/mp4", "video/x-msvideo", "video/quicktime"),
        output_types=("video/mp4",),
        usage_steps=(
            "在目标 worker 上安装 OpenCV 和视频处理运行时。",
            "将遗留 clientApp 工具替换为仓库本地工具。",
            "接入 OCR 或文本检测服务后启用执行。",
        ),
        dependencies=(
            OperatorDependencySpec(kind="legacy_module", name="clientApp", check="clientApp", notes="遗留算子基础和文件工具。"),
            OperatorDependencySpec(kind="python_package", name="cv2", check="cv2", notes="OpenCV 视频处理。"),
            OperatorDependencySpec(kind="python_package", name="numpy", check="numpy", notes="帧数据数值处理。"),
            OperatorDependencySpec(kind="system_binary", name="ffmpeg", check="ffmpeg", notes="视频封装和转码。"),
        ),
        examples=(
            OperatorExampleSpec(
                name="隐私模糊",
                description="对视频中检测到的文本框或隐私区域进行模糊。",
                source_path="E:/datasets/raw_video",
                sink_path="E:/datasets/blurred_video",
                params={},
            ),
        ),
        tags=("视频", "隐私", "模糊"),
    ),
    OperatorSpec(
        key="enhance_video_redundancy_operator",
        name="视频冗余帧过滤",
        modality="video",
        category="enhance",
        status="staged",
        summary="去除视频中的冗余帧，可选保留有意义的音频片段。",
        description=(
            "迁移的源码已存在，但仍依赖遗留模块和最终视频运行时，"
            "需要完成集成后才能在当前仓库运行。"
        ),
        module_path="backend.operators.staged.video.enhance.enhance_video_redundancy_operator",
        class_name="EnhanceVideoRedundancyOperator",
        runtime="GPU",
        workflow_kind="transform",
        migration_status="源码已迁移，运行时集成未完成。",
        input_types=("video/mp4", "video/x-msvideo", "video/quicktime"),
        output_types=("video/mp4", "application/json"),
        usage_steps=(
            "在目标 worker 上安装 OpenCV 和 ffmpeg。",
            "将遗留算子基础和辅助工具导入替换为仓库本地等效实现。",
            "根据视频帧率调整帧筛选参数后启用执行。",
        ),
        dependencies=(
            OperatorDependencySpec(kind="legacy_module", name="clientApp", check="clientApp", notes="遗留算子基础和文件工具。"),
            OperatorDependencySpec(kind="python_package", name="cv2", check="cv2", notes="OpenCV 视频处理。"),
            OperatorDependencySpec(kind="python_package", name="numpy", check="numpy", notes="帧数据数值处理。"),
            OperatorDependencySpec(kind="system_binary", name="ffmpeg", check="ffmpeg", notes="视频封装和转码。"),
        ),
        examples=(
            OperatorExampleSpec(
                name="冗余帧去除",
                description="对存档视频进行冗余帧去除。",
                source_path="E:/datasets/raw_video",
                sink_path="E:/datasets/reduced_video",
                params={"active_keep_fps": 24.0},
            ),
        ),
        tags=("视频", "冗余", "采样"),
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
