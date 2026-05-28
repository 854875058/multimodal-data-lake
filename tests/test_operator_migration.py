# -*- coding: utf-8 -*-

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.operators.text.clean.clean_texts_by_regex import CleanTextsByRegexOperator


class DummyLogger:
    def warning(self, *args, **kwargs):
        return None

    def info(self, *args, **kwargs):
        return None

    def error(self, *args, **kwargs):
        return None


def test_clean_texts_by_regex_masks_sensitive_content(tmp_path):
    source_dir = tmp_path / 'source'
    sink_dir = tmp_path / 'sink'
    source_dir.mkdir()
    input_file = source_dir / 'sample.txt'
    input_file.write_text(
        '张三手机号 13812345678，邮箱 test@example.com，IP 10.2.3.4，身份证 11010519491231002X',
        encoding='utf-8',
    )

    operator = CleanTextsByRegexOperator()
    results = operator.process(
        operator_id='clean_texts_by_regex',
        source_path=str(source_dir),
        sink_path=str(sink_dir),
        param={'chunk_size': 256},
        logger=DummyLogger(),
        config_dict={},
    )

    output_file = sink_dir / 'sample.txt'
    assert output_file.exists()
    content = output_file.read_text(encoding='utf-8')
    assert '13812345678' not in content
    assert 'test@example.com' not in content
    assert '10.2.3.4' not in content
    assert '11010519491231002X' not in content
    assert '138****5678' in content
    assert '*.*.*.*' in content
    assert len(results) == 1
    assert results[0]['result'] == 0
