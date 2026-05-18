# -*- coding: utf-8 -*-
"""全局配置：路径、S3、常量"""

import os

from env_loader import load_local_env_files


load_local_env_files()


def _env_bool(name: str, default: bool = False) -> bool:
    """读取布尔环境变量。"""
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    """读取整型环境变量，失败时回退默认值。"""
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default

# --- 路径 ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# LanceDB 存储位置：
# - 方式A（本地/挂载盘）：用本地目录路径
# - 方式B（对象存储/S3）：用 s3://bucket/prefix（推荐：放 SeaweedFS 的 S3 网关上）
LANCE_DB_URI = None  # 运行时由下方根据 S3_CONFIG 自动生成
TEMP_DIR = os.path.join(BASE_DIR, "temp_uploads")
EXTRACT_DIR = os.path.join(BASE_DIR, "temp_extracted")
DB_PATH = os.path.join(BASE_DIR, "user_data.db")
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_PATH = os.path.join(LOG_DIR, "app.log")
TOWER_EYE_ROOT = os.getenv("TOWER_EYE_ROOT", r"E:\工作\国信\AI数据集项目\Tower-Eye")

# --- Web 服务 ---
CORS_ALLOW_ORIGINS = [
    item.strip()
    for item in os.getenv(
        "CORS_ALLOW_ORIGINS",
        "http://localhost:27844,http://127.0.0.1:27844",
    ).split(",")
    if item.strip()
]
CORS_ALLOW_CREDENTIALS = _env_bool("CORS_ALLOW_CREDENTIALS", True)
BACKEND_RELOAD = _env_bool("BACKEND_RELOAD", False)

DEFAULT_AWS_REGION = (
    os.getenv("S3_REGION")
    or os.getenv("AWS_REGION")
    or os.getenv("AWS_DEFAULT_REGION")
    or "us-east-1"
)
os.environ.setdefault("AWS_REGION", DEFAULT_AWS_REGION)
os.environ.setdefault("AWS_DEFAULT_REGION", DEFAULT_AWS_REGION)
os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")

# --- 系统接口 ---
SYSTEM_API_LOCAL_ONLY = _env_bool("SYSTEM_API_LOCAL_ONLY", True)
MAX_LOG_LINES = max(100, _env_int("MAX_LOG_LINES", 2000))
FILE_DELETE_LOCAL_ONLY = _env_bool("FILE_DELETE_LOCAL_ONLY", True)

# --- S3 ---
# 兼容两种写法：
# 1) 旧写法：aws_access_key_id/aws_secret_access_key/bucket_name
# 2) 新写法：access_key_id/secret_access_key/raw_bucket/lance_bucket
# 优先从环境变量读取，避免硬编码敏感信息
S3_CONFIG = {
    "endpoint_url": os.getenv("S3_ENDPOINT_URL", "http://192.168.20.4:8333"),
    # 你也可以用旧字段名（下面会自动归一化）
    "aws_access_key_id": os.getenv("S3_ACCESS_KEY", "mykey"),
    "aws_secret_access_key": os.getenv("S3_SECRET_KEY", "mysecret"),
    "bucket_name": os.getenv("S3_BUCKET_NAME", "demo-bucket"),
    # 如果你们就是"两桶"，直接填这两个；不填也行，会用 bucket_name 自动派生
    # "raw_bucket": "demo-raw",
    # "lance_bucket": "demo-lance",
    "lance_prefix": os.getenv("S3_LANCE_PREFIX", "lance_lake"),
    "region": os.getenv("S3_REGION", DEFAULT_AWS_REGION),
}

# --- 归一化（保证其它模块都用统一字段）---
if "access_key_id" not in S3_CONFIG:
    S3_CONFIG["access_key_id"] = S3_CONFIG.get("aws_access_key_id", "")
if "secret_access_key" not in S3_CONFIG:
    S3_CONFIG["secret_access_key"] = S3_CONFIG.get("aws_secret_access_key", "")

base_bucket = S3_CONFIG.get("bucket_name", "")
if "raw_bucket" not in S3_CONFIG:
    S3_CONFIG["raw_bucket"] = base_bucket or "demo-raw"
if "lance_bucket" not in S3_CONFIG:
    # 默认：如果没显式给第二个桶，就用 bucket_name 派生一个（避免和原文件混在一起）
    S3_CONFIG["lance_bucket"] = (f"{base_bucket}-lance" if base_bucket else "demo-lance")

# 默认使用方式B：把 LanceDB 表存在 SeaweedFS(S3) 上
LANCE_DB_URI = f"s3://{S3_CONFIG['lance_bucket']}/{S3_CONFIG.get('lance_prefix','lance_lake')}"

# --- LLM / 知识图谱 ---
# 建议在环境变量中配置 DEEPSEEK_API_KEY；如需本地测试，可临时在此处填入测试密钥
# Load secrets from .env/.env.local or process environment. Do not hardcode them in source files.
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

# --- 文本分块 ---
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

# --- 文件大小限制 ---
MAX_FILE_SIZE_MB = 100  # 单个文件最大 100MB（超过此大小不存储到 files 表）
MAX_UPLOAD_SIZE_MB = 500  # 单次上传总大小限制

# --- 支持格式 ---
CONTENT_EXTS = [
    "txt", "md", "docx", "pdf", "pptx", "log", "csv", "xlsx", "xls",
    "py", "sh", "js", "json", "sql", "mp3", "wav", "mp4", "avi", "mov", "m4a",
]
IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "bmp", "webp"]
ARCHIVE_EXTS = ["zip", "tar", "gz", "tgz"]
