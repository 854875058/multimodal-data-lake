# -*- coding: utf-8 -*-
"""文本情感分析算子（基于关键词规则）"""

from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, is_text_file, parse_operator_params, walk_files

POSITIVE_WORDS = {'好', '优秀', '棒', '赞', '喜欢', '满意', '高兴', '出色', '完美', '精彩', '推荐', '不错', 'great', 'good', 'excellent', 'amazing', 'love', 'perfect', 'wonderful', 'best', 'happy', 'awesome'}
NEGATIVE_WORDS = {'差', '烂', '糟', '坏', '讨厌', '失望', '垃圾', '失败', '可怕', '痛苦', 'bad', 'terrible', 'awful', 'worst', 'hate', 'horrible', 'poor', 'disappointing', 'ugly', 'boring'}

class SentimentAnalysisOperator:
    """基于关键词规则的文本情感分析，输出情感标签和分数。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        threshold = float(params.get('threshold', 0.1))
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative.with_suffix('.json')
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                if is_text_file(str(file_path)):
                    content = file_path.read_text(encoding='utf-8', errors='ignore').lower()
                    pos = sum(1 for w in POSITIVE_WORDS if w in content)
                    neg = sum(1 for w in NEGATIVE_WORDS if w in content)
                    total = pos + neg
                    score = (pos - neg) / max(total, 1)
                    if score > threshold:
                        label = 'positive'
                    elif score < -threshold:
                        label = 'negative'
                    else:
                        label = 'neutral'
                    import json
                    output_path.write_text(json.dumps({'label': label, 'score': round(score, 3), 'positive': pos, 'negative': neg}, ensure_ascii=False, indent=2), encoding='utf-8')
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                else:
                    copy_file(str(file_path), str(output_path))
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))
            except Exception as e:
                logger.error('情感分析失败: %s', e)
                copy_file(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 1))
        return results
