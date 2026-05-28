# -*- coding: utf-8 -*-
"""S3 工具函数"""

import logging
import boto3
from backend.core.config import S3_CONFIG

logger = logging.getLogger(__name__)

def delete_from_s3(s3_uri: str):
    """从 S3 删除文件

    Args:
        s3_uri: S3 URI，格式如 s3://bucket/key
    """
    try:
        # 解析 S3 URI
        if not s3_uri.startswith("s3://"):
            logger.warning(f"无效的 S3 URI: {s3_uri}")
            return False

        parts = s3_uri[5:].split("/", 1)
        if len(parts) != 2:
            logger.warning(f"无法解析 S3 URI: {s3_uri}")
            return False

        bucket, key = parts

        # 创建 S3 客户端
        s3 = boto3.client(
            "s3",
            endpoint_url=S3_CONFIG["endpoint_url"],
            aws_access_key_id=S3_CONFIG["access_key_id"],
            aws_secret_access_key=S3_CONFIG["secret_access_key"],
        )

        # 删除对象
        s3.delete_object(Bucket=bucket, Key=key)
        logger.info(f"已从 S3 删除: {s3_uri}")
        return True

    except Exception as e:
        logger.error(f"从 S3 删除文件失败 {s3_uri}: {e}")
        return False
