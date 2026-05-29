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
    # === 文本处理算子 ===
    OperatorSpec(
        key="regex_replace",
        name="正则替换",
        modality="text",
        category="replace",
        status="active",
        summary="使用正则表达式批量替换文本内容。",
        description="遍历源目录中的文本文件，使用正则表达式进行批量查找替换。",
        module_path="backend.operators.text.regex.regex_replace",
        class_name="RegexReplaceOperator",
        runtime="CPU",
        workflow_kind="transform",
        input_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        output_types=("text/plain",),
        parameters=(
            OperatorParameterSpec(name="pattern", type="string", description="正则表达式", required=True, example="\\d{11}"),
            OperatorParameterSpec(name="replacement", type="string", description="替换内容", default="***", example="[已脱敏]"),
        ),
        tags=("正则", "替换", "文本"),
    ),
    OperatorSpec(
        key="text_merge",
        name="文本合并",
        modality="text",
        category="merge",
        status="active",
        summary="将多个文本文件合并为一个文件。",
        description="遍历源目录，将所有文本文件内容合并为一个输出文件，支持自定义分隔符。",
        module_path="backend.operators.text.merge.text_merge",
        class_name="TextMergeOperator",
        runtime="CPU",
        workflow_kind="transform",
        input_types=("text/plain", "text/markdown"),
        output_types=("text/plain",),
        parameters=(
            OperatorParameterSpec(name="separator", type="string", description="文件分隔符", default="\n\n"),
            OperatorParameterSpec(name="add_filename", type="boolean", description="添加文件名标记", default=True),
            OperatorParameterSpec(name="output_name", type="string", description="输出文件名", default="merged.txt"),
        ),
        tags=("合并", "文本"),
    ),
    OperatorSpec(
        key="encoding_convert",
        name="编码转换",
        modality="text",
        category="convert",
        status="active",
        summary="批量转换文本文件编码。",
        description="自动检测或指定源编码，批量转换为指定目标编码。",
        module_path="backend.operators.text.encoding.encoding_convert",
        class_name="EncodingConvertOperator",
        runtime="CPU",
        workflow_kind="transform",
        input_types=("text/plain", "text/csv"),
        output_types=("text/plain",),
        parameters=(
            OperatorParameterSpec(name="source_encoding", type="string", description="源编码（auto=自动检测）", default="auto", enum=("auto", "utf-8", "gbk", "gb2312", "latin-1")),
            OperatorParameterSpec(name="target_encoding", type="string", description="目标编码", default="utf-8", enum=("utf-8", "gbk", "latin-1")),
        ),
        tags=("编码", "转换", "文本"),
    ),
    OperatorSpec(
        key="markdown_to_text",
        name="Markdown 转文本",
        modality="text",
        category="convert",
        status="active",
        summary="将 Markdown 文件转换为纯文本。",
        description="去除 Markdown 标记语法（标题、加粗、链接、代码块等），输出纯文本。",
        module_path="backend.operators.text.markdown.markdown_to_text",
        class_name="MarkdownToTextOperator",
        runtime="CPU",
        workflow_kind="transform",
        input_types=("text/markdown",),
        output_types=("text/plain",),
        parameters=(),
        tags=("Markdown", "转换", "文本"),
    ),
    OperatorSpec(
        key="html_to_text",
        name="HTML 转文本",
        modality="text",
        category="convert",
        status="active",
        summary="将 HTML 文件转换为纯文本。",
        description="去除 HTML 标签、脚本、样式，提取正文文本内容。",
        module_path="backend.operators.text.html.html_to_text",
        class_name="HtmlToTextOperator",
        runtime="CPU",
        workflow_kind="transform",
        input_types=("text/html",),
        output_types=("text/plain",),
        parameters=(),
        tags=("HTML", "转换", "文本"),
    ),
    # === 文件处理算子 ===
    OperatorSpec(
        key="file_copy",
        name="文件筛选拷贝",
        modality="file",
        category="copy",
        status="active",
        summary="按条件筛选并拷贝文件。",
        description="支持按扩展名、文件大小范围筛选文件并拷贝到目标目录。",
        module_path="backend.operators.file.copy.file_copy",
        class_name="FileCopyOperator",
        runtime="CPU",
        workflow_kind="transform",
        input_types=("application/octet-stream",),
        output_types=("application/octet-stream",),
        parameters=(
            OperatorParameterSpec(name="extensions", type="array", description="文件扩展名过滤", default=[], example=[".txt", ".csv"]),
            OperatorParameterSpec(name="min_size_kb", type="integer", description="最小文件大小(KB)", default=0),
            OperatorParameterSpec(name="max_size_kb", type="integer", description="最大文件大小(KB，0=不限)", default=0),
        ),
        tags=("拷贝", "筛选", "文件"),
    ),
    OperatorSpec(
        key="directory_tree",
        name="目录树生成",
        modality="file",
        category="tree",
        status="active",
        summary="生成目录树结构的 JSON 报告。",
        description="遍历源目录，生成包含文件名、大小、层级的目录树 JSON。",
        module_path="backend.operators.file.tree.directory_tree",
        class_name="DirectoryTreeOperator",
        runtime="CPU",
        workflow_kind="transform",
        input_types=("application/octet-stream",),
        output_types=("application/json",),
        parameters=(
            OperatorParameterSpec(name="max_depth", type="integer", description="最大扫描深度", default=3, example=5),
        ),
        tags=("目录", "树", "结构"),
    ),
    OperatorSpec(
        key="file_age_filter",
        name="文件时间筛选",
        modality="file",
        category="filter",
        status="active",
        summary="按文件修改时间筛选文件。",
        description="根据文件修改时间筛选，保留N天内/前的文件。",
        module_path="backend.operators.file.age.file_age_filter",
        class_name="FileAgeFilterOperator",
        runtime="CPU",
        workflow_kind="transform",
        input_types=("application/octet-stream",),
        output_types=("application/octet-stream",),
        parameters=(
            OperatorParameterSpec(name="max_age_days", type="integer", description="天数阈值", default=30, example=7),
            OperatorParameterSpec(name="mode", type="string", description="筛选模式", default="newer", enum=("newer", "older")),
        ),
        tags=("时间", "筛选", "文件"),
    ),
    OperatorSpec(
        key="file_size_filter",
        name="文件大小筛选",
        modality="file",
        category="filter",
        status="active",
        summary="按文件大小筛选文件。",
        description="根据文件大小筛选，支持区间、大于、小于模式。",
        module_path="backend.operators.file.size.file_size_filter",
        class_name="FileSizeFilterOperator",
        runtime="CPU",
        workflow_kind="transform",
        input_types=("application/octet-stream",),
        output_types=("application/octet-stream",),
        parameters=(
            OperatorParameterSpec(name="min_kb", type="integer", description="最小大小(KB)", default=0),
            OperatorParameterSpec(name="max_kb", type="integer", description="最大大小(KB，0=不限)", default=0),
            OperatorParameterSpec(name="mode", type="string", description="筛选模式", default="between", enum=("between", "smaller", "larger")),
        ),
        tags=("大小", "筛选", "文件"),
    ),
    # === 数据处理算子 ===
    OperatorSpec(
        key="csv_merge",
        name="CSV 合并",
        modality="text",
        category="merge",
        status="active",
        summary="合并多个 CSV 文件（要求表头一致）。",
        description="遍历源目录，将所有 CSV 文件合并为一个，自动处理表头去重。",
        module_path="backend.operators.data.csv.csv_merge",
        class_name="CsvMergeOperator",
        runtime="CPU",
        workflow_kind="transform",
        input_types=("text/csv",),
        output_types=("text/csv",),
        parameters=(
            OperatorParameterSpec(name="encoding", type="string", description="文件编码", default="utf-8", enum=("utf-8", "gbk")),
        ),
        tags=("CSV", "合并", "数据"),
    ),
    OperatorSpec(
        key="yaml_to_json",
        name="YAML 转 JSON",
        modality="text",
        category="convert",
        status="active",
        summary="将 YAML 文件转换为 JSON 格式。",
        description="使用 PyYAML 解析 YAML 文件并输出为 JSON 格式。",
        module_path="backend.operators.data.yaml.yaml_to_json",
        class_name="YamlToJsonOperator",
        runtime="CPU",
        workflow_kind="transform",
        input_types=("text/yaml",),
        output_types=("application/json",),
        parameters=(
            OperatorParameterSpec(name="indent", type="integer", description="JSON 缩进空格数", default=2),
        ),
        tags=("YAML", "JSON", "转换"),
    ),
    OperatorSpec(
        key="csv_to_markdown",
        name="CSV 转 Markdown",
        modality="text",
        category="convert",
        status="active",
        summary="将 CSV 文件转换为 Markdown 表格。",
        description="读取 CSV 文件，自动生成 Markdown 表格格式输出。",
        module_path="backend.operators.data.convert.csv_to_markdown",
        class_name="CsvToMarkdownOperator",
        runtime="CPU",
        workflow_kind="transform",
        input_types=("text/csv",),
        output_types=("text/markdown",),
        parameters=(
            OperatorParameterSpec(name="encoding", type="string", description="文件编码", default="utf-8"),
            OperatorParameterSpec(name="max_rows", type="integer", description="最大输出行数", default=100, example=500),
        ),
        tags=("CSV", "Markdown", "转换"),
    ),
    # === 系统工具算子 ===
    OperatorSpec(
        key="system_info",
        name="系统信息采集",
        modality="system",
        category="info",
        status="active",
        summary="采集系统信息：操作系统、CPU、内存、磁盘等。",
        description="采集当前运行环境的系统信息，输出为 JSON 报告。",
        module_path="backend.operators.system.info.system_info",
        class_name="SystemInfoOperator",
        runtime="CPU",
        workflow_kind="transform",
        input_types=(),
        output_types=("application/json",),
        parameters=(),
        tags=("系统", "信息", "监控"),
    ),
    # === 文本分析算子 ===
    OperatorSpec(
        key="sentiment_analysis",
        name="情感分析",
        modality="text",
        category="analyze",
        status="active",
        summary="基于关键词规则的文本情感分析，输出正面/负面/中性标签。",
        description="使用中英文情感关键词词典，统计正负面词频，计算情感得分。",
        module_path="backend.operators.text.sentiment.sentiment_analysis",
        class_name="SentimentAnalysisOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        output_types=("application/json",),
        parameters=(
            OperatorParameterSpec(name="threshold", type="number", description="情感判定阈值", default=0.1, example=0.1),
        ),
        tags=("情感", "分析", "NLP"),
    ),
    OperatorSpec(
        key="language_detection",
        name="语言检测",
        modality="text",
        category="analyze",
        status="active",
        summary="检测文本文件的语言类型（中文/英文/混合/其他）。",
        description="通过中文字符占比判断语言类型，支持中英文混合检测。",
        module_path="backend.operators.text.language.language_detection",
        class_name="LanguageDetectionOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        output_types=("application/json",),
        parameters=(),
        tags=("语言", "检测", "NLP"),
    ),
    OperatorSpec(
        key="text_normalization",
        name="文本标准化",
        modality="text",
        category="normalize",
        status="active",
        summary="标准化文本：去除多余空白、统一换行符、去除特殊字符。",
        description="批量标准化文本文件，支持去除多余空格、统一换行符、去除特殊字符。",
        module_path="backend.operators.text.normalize.text_normalization",
        class_name="TextNormalizationOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        output_types=("text/plain", "text/markdown"),
        parameters=(
            OperatorParameterSpec(name="remove_extra_spaces", type="boolean", description="去除多余空格", default=True),
            OperatorParameterSpec(name="normalize_newlines", type="boolean", description="统一换行符", default=True),
            OperatorParameterSpec(name="remove_special_chars", type="boolean", description="去除特殊字符", default=False),
        ),
        tags=("标准化", "清洗", "文本"),
    ),
    OperatorSpec(
        key="keyword_extraction",
        name="关键词提取",
        modality="text",
        category="extract",
        status="active",
        summary="从文本文件中提取高频关键词。",
        description="使用词频统计方法提取中英文关键词，自动过滤停用词。",
        module_path="backend.operators.text.extract.keyword_extraction",
        class_name="KeywordExtractionOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        output_types=("application/json",),
        parameters=(
            OperatorParameterSpec(name="top_k", type="integer", description="提取关键词数量", default=10, example=20),
        ),
        tags=("关键词", "提取", "NLP"),
    ),
    OperatorSpec(
        key="text_summarization",
        name="文本摘要",
        modality="text",
        category="extract",
        status="active",
        summary="基于句子权重的文本摘要提取（纯规则，不依赖 LLM）。",
        description="使用句子长度和位置权重提取关键句子作为摘要。",
        module_path="backend.operators.text.summarize.text_summarization",
        class_name="TextSummarizationOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("text/plain", "text/markdown"),
        output_types=("text/plain",),
        parameters=(
            OperatorParameterSpec(name="max_sentences", type="integer", description="摘要最大句子数", default=3, example=5),
        ),
        tags=("摘要", "提取", "NLP"),
    ),
    # === 文件处理算子 ===
    OperatorSpec(
        key="file_compression",
        name="文件压缩",
        modality="file",
        category="compress",
        status="active",
        summary="批量压缩文件，支持 gzip 和 zip 格式。",
        description="遍历源目录，将文件压缩为 gzip 或 zip 格式输出。",
        module_path="backend.operators.file.compress.file_compression",
        class_name="FileCompressionOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("text/plain", "application/octet-stream"),
        output_types=("application/gzip", "application/zip"),
        parameters=(
            OperatorParameterSpec(name="format", type="string", description="压缩格式", default="gzip", enum=("gzip", "zip")),
        ),
        tags=("压缩", "gzip", "zip"),
    ),
    OperatorSpec(
        key="file_splitter",
        name="文件分割",
        modality="file",
        category="split",
        status="active",
        summary="将大文件按行数分割为多个小文件。",
        description="遍历源目录，将文本文件按指定行数分割为多个部分。",
        module_path="backend.operators.file.split.file_splitter",
        class_name="FileSplitterOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("text/plain", "text/markdown", "application/json", "text/csv"),
        output_types=("text/plain",),
        parameters=(
            OperatorParameterSpec(name="max_lines", type="integer", description="每个分片最大行数", default=10000, example=5000),
        ),
        tags=("分割", "大文件", "文件"),
    ),
    OperatorSpec(
        key="file_validation",
        name="文件校验",
        modality="file",
        category="validate",
        status="active",
        summary="校验文件完整性：计算哈希值、检查大小、检测编码。",
        description="遍历源目录，为每个文件计算哈希值、检测编码，输出校验报告。",
        module_path="backend.operators.file.validate.file_validation",
        class_name="FileValidationOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("text/plain", "application/octet-stream"),
        output_types=("application/json",),
        parameters=(
            OperatorParameterSpec(name="algorithm", type="string", description="哈希算法", default="md5", enum=("md5", "sha256")),
        ),
        tags=("校验", "哈希", "完整性"),
    ),
    # === 图像处理算子 ===
    OperatorSpec(
        key="image_resize",
        name="图片缩放",
        modality="image",
        category="resize",
        status="active",
        summary="批量缩放图片尺寸，保持宽高比。",
        description="使用 Pillow 库批量缩放图片，支持 jpg/png/webp/bmp 等格式。",
        module_path="backend.operators.image.resize.image_resize",
        class_name="ImageResizeOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("image/jpeg", "image/png", "image/webp", "image/bmp"),
        output_types=("image/jpeg", "image/png", "image/webp"),
        parameters=(
            OperatorParameterSpec(name="max_width", type="integer", description="最大宽度（像素）", default=1024, example=800),
            OperatorParameterSpec(name="max_height", type="integer", description="最大高度（像素）", default=1024, example=600),
            OperatorParameterSpec(name="quality", type="integer", description="输出质量（1-100）", default=85, example=90),
        ),
        tags=("图片", "缩放", "尺寸"),
    ),
    OperatorSpec(
        key="image_convert",
        name="图片格式转换",
        modality="image",
        category="convert",
        status="active",
        summary="批量转换图片格式（jpg/png/webp/bmp）。",
        description="使用 Pillow 库批量转换图片格式，支持质量参数控制。",
        module_path="backend.operators.image.convert.image_convert",
        class_name="ImageConvertOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("image/jpeg", "image/png", "image/webp", "image/bmp"),
        output_types=("image/jpeg", "image/png", "image/webp"),
        parameters=(
            OperatorParameterSpec(name="target_format", type="string", description="目标格式", default="png", enum=("jpg", "jpeg", "png", "webp", "bmp")),
            OperatorParameterSpec(name="quality", type="integer", description="输出质量（1-100）", default=90, example=95),
        ),
        tags=("图片", "格式", "转换"),
    ),
    OperatorSpec(
        key="image_metadata",
        name="图片元数据提取",
        modality="image",
        category="extract",
        status="active",
        summary="提取图片元数据：尺寸、格式、DPI、EXIF 信息。",
        description="使用 Pillow 提取图片的尺寸、格式、DPI 和 EXIF 信息，输出为 JSON 报告。",
        module_path="backend.operators.image.extract.image_metadata",
        class_name="ImageMetadataOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("image/jpeg", "image/png", "image/webp", "image/bmp"),
        output_types=("application/json",),
        parameters=(),
        tags=("图片", "元数据", "EXIF"),
    ),
    # === 数据处理算子 ===
    OperatorSpec(
        key="json_transform",
        name="JSON 转换",
        modality="text",
        category="transform",
        status="active",
        summary="JSON 数据转换：格式化、扁平化、字段筛选。",
        description="遍历源目录中的 JSON 文件，支持格式化输出、嵌套结构扁平化、按字段筛选。",
        module_path="backend.operators.data.transform.json_transform",
        class_name="JsonTransformOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("application/json",),
        output_types=("application/json",),
        parameters=(
            OperatorParameterSpec(name="mode", type="string", description="转换模式", default="format", enum=("format", "flatten", "filter")),
            OperatorParameterSpec(name="fields", type="array", description="筛选字段列表（filter 模式）", default=[], example=["name", "age"]),
            OperatorParameterSpec(name="indent", type="integer", description="缩进空格数", default=2),
        ),
        tags=("JSON", "转换", "格式化"),
    ),
    OperatorSpec(
        key="data_enrichment",
        name="数据丰富",
        modality="file",
        category="enrich",
        status="active",
        summary="为数据文件添加丰富元信息：处理时间、哈希、行数统计。",
        description="遍历源目录，为每个文件计算哈希、行数、字符数等元信息，输出丰富报告。",
        module_path="backend.operators.data.enrich.data_enrichment",
        class_name="DataEnrichmentOperator",
        runtime="CPU",
        workflow_kind="transform",
        migration_status="已迁移，可直接运行。",
        input_types=("text/plain", "application/json", "text/csv"),
        output_types=("application/json",),
        parameters=(),
        tags=("丰富", "元数据", "统计"),
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
