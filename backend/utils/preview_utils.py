# -*- coding: utf-8 -*-
"""检索结果：预览路径与类型判断"""

import os

# 可前端预览的扩展名
PREVIEW_IMAGE = {"jpg", "jpeg", "png", "gif", "bmp", "webp"}
PREVIEW_AUDIO = {"mp3", "wav", "m4a", "flac", "ogg"}
PREVIEW_VIDEO = {"mp4", "webm", "ogg", "mov"}
PREVIEW_TEXT = {"txt", "md", "py", "json", "log", "sh", "js", "sql", "xml", "yaml", "ini", "csv"}


def get_preview_path(file_hash, doc_name, doc_type=None):
    """方式B下不再使用本地预览路径（原始文件在 LanceDB `files` 表里）。保留函数以兼容旧调用。"""
    _ = (file_hash, doc_name, doc_type)
    return None


def can_preview_inline(ext):
    """是否可在页面内直接预览（图片/音视频/文本）"""
    return ext in PREVIEW_IMAGE or ext in PREVIEW_AUDIO or ext in PREVIEW_VIDEO or ext in PREVIEW_TEXT
