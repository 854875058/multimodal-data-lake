# -*- coding: utf-8 -*-
"""HTML 转纯文本算子"""
from __future__ import annotations
import re
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, parse_operator_params, walk_files

def html_to_text(html: str) -> str:
    text = re.sub(r'<script[\s\S]*?</script>', '', html, flags=re.IGNORECASE)
    text = re.sub(r'<style[\s\S]*?</style>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</p>', '\n\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</div>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</h[1-6]>', '\n\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<li>', '- ', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

class HtmlToTextOperator:
    """将 HTML 文件转换为纯文本。"""
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
                if file_path.suffix.lower() in ('.html', '.htm'):
                    content = file_path.read_text(encoding='utf-8', errors='ignore')
                    output_path.write_text(html_to_text(content), encoding='utf-8')
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                else:
                    copy_file(str(file_path), str(sink_root / relative))
                    results.append(build_process_file_info(operator_id, str(file_path), str(sink_root / relative), 2))
            except Exception as e:
                logger.error('HTML 转换失败: %s', e)
        return results
