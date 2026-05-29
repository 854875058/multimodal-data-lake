# -*- coding: utf-8 -*-
"""PPT/PDF 转 Markdown 算子（基于 MinerU magic-pdf）"""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any, Dict, List

from backend.operators.runtime import (
    build_process_file_info,
    copy_file,
    is_dir_empty,
    is_directory_ready,
    parse_operator_params,
    walk_files,
)


class NormalizePptToMarkdown:
    """将 PPT/PPTX/PDF 文件转换为 Markdown 格式。

    基于 MinerU (magic-pdf) 的版面分析能力，支持：
    - PPT/PPTX → 先转 PDF → 再解析为 Markdown
    - PDF → 直接解析为 Markdown（含表格、图片描述）
    - 其他文件直接拷贝
    """

    SUPPORTED_EXTENSIONS = {'.pptx', '.ppt', '.pdf'}

    def process(
        self,
        operator_id: str,
        source_path: str,
        sink_path: str,
        param: Any,
        logger,
        config_dict: Dict[str, Any] | None = None,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            logger.warning('算子输入目录不可用: %s', source_path)
            return results

        params = parse_operator_params(param)
        enable_ocr = bool(params.get('enable_ocr', False))
        batch_size = max(1, int(params.get('batch_size', 5)))

        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)

        # 收集需要处理的文件
        ppt_files: List[Path] = []
        other_files: List[Path] = []
        for file_path in walk_files(source_path):
            if file_path.suffix.lower() in self.SUPPORTED_EXTENSIONS:
                ppt_files.append(file_path)
            else:
                other_files.append(file_path)

        # 非支持格式直接拷贝
        for file_path in other_files:
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative
            output_path.parent.mkdir(parents=True, exist_ok=True)
            copy_file(str(file_path), str(output_path))
            results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))

        # 处理 PPT/PDF 文件
        for file_path in ppt_files:
            relative = file_path.relative_to(source_root)
            md_output = sink_root / relative.with_suffix('.md')
            md_output.parent.mkdir(parents=True, exist_ok=True)
            try:
                success = self._convert_to_markdown(file_path, md_output, enable_ocr, logger)
                if success:
                    results.append(build_process_file_info(operator_id, str(file_path), str(md_output), 0))
                    logger.info('转换成功: %s -> %s', file_path.name, md_output.name)
                else:
                    copy_file(str(file_path), str(sink_root / relative))
                    results.append(build_process_file_info(operator_id, str(file_path), str(sink_root / relative), 1))
            except Exception as error:
                logger.error('转换失败: %s, error=%s', file_path, error, exc_info=True)
                copy_file(str(file_path), str(sink_root / relative))
                results.append(build_process_file_info(operator_id, str(file_path), str(sink_root / relative), 1))

        return results

    def _convert_to_markdown(self, input_path: Path, output_path: Path, enable_ocr: bool, logger) -> bool:
        """使用 magic-pdf 将文件转换为 Markdown"""
        try:
            from magic_pdf.data.data_reader_writer import FileBasedDataWriter, FileBasedDataReader
            from magic_pdf.data.read_api import read_local_pdfs
            from magic_pdf.model.doc_analyze_by_custom_model import doc_analyze

            # 读取 PDF（PPT 需要先转 PDF）
            if input_path.suffix.lower() in {'.pptx', '.ppt'}:
                pdf_path = self._convert_ppt_to_pdf(input_path, logger)
                if not pdf_path:
                    return False
            else:
                pdf_path = input_path

            # 读取 PDF 内容
            pdf_bytes = read_local_pdfs(str(pdf_path))

            # 创建写入器
            output_dir = output_path.parent
            image_dir = output_dir / f'{output_path.stem}_images'
            image_dir.mkdir(parents=True, exist_ok=True)
            writer = FileBasedDataWriter(str(output_dir))
            image_writer = FileBasedDataWriter(str(image_dir))

            # 执行解析
            pipe_result = doc_analyze(pdf_bytes, enable_ocr=enable_ocr)

            # 生成 Markdown
            md_content = pipe_result.get_markdown(image_dir.name)

            # 写入文件
            output_path.write_text(md_content, encoding='utf-8')

            # 清理临时 PDF（如果是从 PPT 转换的）
            if input_path.suffix.lower() in {'.pptx', '.ppt'} and pdf_path != input_path:
                try:
                    pdf_path.unlink()
                except Exception:
                    pass

            return True

        except ImportError as e:
            logger.error('magic-pdf 未安装或导入失败: %s', e)
            return False
        except Exception as e:
            logger.error('magic-pdf 转换失败: %s', e)
            return False

    def _convert_ppt_to_pdf(self, ppt_path: Path, logger) -> Path | None:
        """使用 LibreOffice 将 PPT 转为 PDF（如果可用）"""
        import subprocess
        import platform

        soffice = 'soffice'
        if platform.system() == 'Windows':
            # Windows 上尝试常见路径
            candidates = [
                r'C:\Program Files\LibreOffice\program\soffice.exe',
                r'C:\Program Files (x86)\LibreOffice\program\soffice.exe',
            ]
            for c in candidates:
                if Path(c).exists():
                    soffice = c
                    break

        try:
            output_dir = ppt_path.parent
            subprocess.run(
                [soffice, '--headless', '--convert-to', 'pdf', '--outdir', str(output_dir), str(ppt_path)],
                capture_output=True, text=True, timeout=120,
            )
            pdf_path = ppt_path.with_suffix('.pdf')
            if pdf_path.exists():
                return pdf_path
            logger.warning('LibreOffice 转 PDF 失败: %s', ppt_path)
            return None
        except FileNotFoundError:
            logger.warning('LibreOffice 未安装，无法处理 PPT 文件: %s', ppt_path)
            return None
        except Exception as e:
            logger.warning('PPT 转 PDF 异常: %s', e)
            return None
