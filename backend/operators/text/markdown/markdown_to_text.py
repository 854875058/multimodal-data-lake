# -*- coding: utf-8 -*-
"""Markdown 转纯文本算子"""
from __future__ import annotations
import re
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, is_text_file, parse_operator_params, walk_files

def md_to_text(md: str) -> str:
    text = re.sub(r'^#{1,6}\s+', '', md, flags=re.MULTILINE)
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'`(.+?)`', r'\1', text)
    text = re.sub(r'```[\s\S]*?```', '', text)
    text = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', text)
    text = re.sub(r'!\[.*?\]\(.+?\)', '[图片]', text)
    text = re.sub(r'^[-*+]\s+', '- ', text, flags=re.MULTILINE)
    text = re.sub(r'^\d+\.\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

class MarkdownToTextOperator:
    """将 Markdown 文件转换为纯文本。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative.with_suffix('.txt')
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                if file_path.suffix.lower() in ('.md', '.markdown'):
                    content = file_path.read_text(encoding='utf-8', errors='ignore')
                    output_path.write_text(md_to_text(content), encoding='utf-8')
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                else:
                    copy_file(str(file_path), str(sink_root / relative))
                    results.append(build_process_file_info(operator_id, str(file_path), str(sink_root / relative), 2))
            except Exception as e:
                logger.error('转换失败: %s', e)
        return results
