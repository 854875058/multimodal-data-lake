# -*- coding: utf-8 -*-
"""文本摘要提取算子"""

from __future__ import annotations
import re
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, is_text_file, parse_operator_params, walk_files

def extract_summary(text: str, max_sentences: int = 3) -> str:
    sentences = re.split(r'[。！？.!?\n]+', text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 10]
    if not sentences:
        return text[:200]
    # 按句子长度加权取前N句
    scored = [(s, len(s) * (1 + 1.0 / (i + 1))) for i, s in enumerate(sentences)]
    scored.sort(key=lambda x: -x[1])
    summary = [s for s, _ in scored[:max_sentences]]
    summary.sort(key=lambda s: text.index(s))
    return '。'.join(summary) + '。'

class TextSummarizationOperator:
    """基于句子权重的文本摘要提取（纯规则，不依赖 LLM）。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        max_sentences = max(1, int(params.get('max_sentences', 3)))
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative.with_suffix('.summary.txt')
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                if is_text_file(str(file_path)):
                    content = file_path.read_text(encoding='utf-8', errors='ignore')
                    summary = extract_summary(content, max_sentences)
                    output_path.write_text(summary, encoding='utf-8')
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                else:
                    copy_file(str(file_path), str(output_path))
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))
            except Exception as e:
                logger.error('摘要提取失败: %s', e)
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 1))
        return results
