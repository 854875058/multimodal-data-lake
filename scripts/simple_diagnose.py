# -*- coding: utf-8 -*-
"""简单诊断：检查 SQLite 和日志"""

import sqlite3
import os
from pathlib import Path

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "user_data.db"
LOG_PATH = BASE_DIR / "app.log"

print("=" * 60)
print("简单诊断工具")
print("=" * 60)

# 1. 检查 SQLite 数据库
print("\n【1】SQLite 数据库检查")
print("-" * 60)
if DB_PATH.exists():
    print(f"✅ 数据库文件存在: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)

    # 检查 file_registry 表
    cursor = conn.execute("SELECT COUNT(*) FROM file_registry")
    count = cursor.fetchone()[0]
    print(f"file_registry 表记录数: {count}")

    if count > 0:
        print("\n最近 5 条文件注册记录:")
        cursor = conn.execute(
            "SELECT file_hash, file_name, file_size, upload_time "
            "FROM file_registry ORDER BY id DESC LIMIT 5"
        )
        for row in cursor.fetchall():
            print(f"  - hash: {row[0][:16]}... | 文件: {row[1]} | 大小: {row[2]} bytes | 时间: {row[3]}")

    # 检查 task_stats 表
    cursor = conn.execute("SELECT COUNT(*) FROM task_stats")
    task_count = cursor.fetchone()[0]
    print(f"\ntask_stats 表记录数: {task_count}")

    if task_count > 0:
        print("\n最近 5 条任务记录:")
        cursor = conn.execute(
            "SELECT task_type, file_count, success_count, processing_time, created_at "
            "FROM task_stats ORDER BY id DESC LIMIT 5"
        )
        for row in cursor.fetchall():
            print(f"  - 类型: {row[0]} | 文件数: {row[1]} | 成功: {row[2]} | 耗时: {row[3]:.2f}s | 时间: {row[4]}")

    conn.close()
else:
    print(f"❌ 数据库文件不存在: {DB_PATH}")

# 2. 检查日志文件
print("\n【2】日志文件检查")
print("-" * 60)
if LOG_PATH.exists():
    print(f"✅ 日志文件存在: {LOG_PATH}")
    with open(LOG_PATH, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()

    print(f"日志总行数: {len(lines)}")

    # 查找错误和警告
    errors = [l for l in lines if "ERROR" in l or "error" in l.lower()]
    warnings = [l for l in lines if "WARNING" in l or "warning" in l.lower()]
    files_errors = [l for l in lines if "files 表" in l and ("失败" in l or "ERROR" in l)]

    print(f"错误日志数: {len(errors)}")
    print(f"警告日志数: {len(warnings)}")
    print(f"files 表相关错误: {len(files_errors)}")

    if files_errors:
        print("\n⚠️ files 表相关错误（最近 5 条）:")
        for line in files_errors[-5:]:
            print(f"  {line.strip()}")

    # 显示最后 10 行日志
    print("\n最后 10 行日志:")
    for line in lines[-10:]:
        print(f"  {line.strip()}")
else:
    print(f"❌ 日志文件不存在: {LOG_PATH}")

# 3. 检查临时目录
print("\n【3】临时目录检查")
print("-" * 60)
temp_dir = BASE_DIR / "temp_uploads"
extract_dir = BASE_DIR / "temp_extracted"

for d in [temp_dir, extract_dir]:
    if d.exists():
        files = list(d.glob("*"))
        print(f"✅ {d.name}: {len(files)} 个文件")
    else:
        print(f"❌ {d.name}: 不存在")

print("\n" + "=" * 60)
print("诊断完成")
print("=" * 60)
print("\n💡 建议:")
print("1. 如果看到 'files 表写入失败' 的错误，说明之前上传时就失败了")
print("2. 检查 LanceDB 连接配置（config.py 中的 S3_CONFIG）")
print("3. 尝试重新上传文件，新代码会在 files 表写入失败时立即报错")
