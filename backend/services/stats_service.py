# -*- coding: utf-8 -*-
"""领导看板：统计与趋势数据"""

import sqlite3
from backend.core.config import DB_PATH


def get_dashboard_stats():
    """核心看板指标：总文件、今日/本周新增、任务成功率、平均耗时"""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()

        total_files = c.execute("SELECT COUNT(*) FROM file_registry").fetchone()[0]

        c.execute(
            "SELECT COUNT(*) FROM file_registry WHERE date(upload_time) = date('now', 'localtime')"
        )
        today_files = c.fetchone()[0]

        c.execute(
            """SELECT COUNT(*) FROM file_registry
               WHERE upload_time >= date('now', 'localtime', '-7 days')"""
        )
        week_files = c.fetchone()[0]

        c.execute(
            """SELECT COALESCE(SUM(file_count),0), COALESCE(SUM(success_count),0), COALESCE(AVG(processing_time),0)
               FROM task_stats WHERE created_at >= date('now', 'localtime', '-7 days')"""
        )
        row = c.fetchone()
        week_tasks_total = row[0] or 0
        week_tasks_success = row[1] or 0
        week_avg_time = row[2] or 0

        return {
            "total_files": total_files,
            "today_files": today_files,
            "week_files": week_files,
            "week_tasks_total": int(week_tasks_total),
            "week_tasks_success": int(week_tasks_success),
            "week_success_rate": round(week_tasks_success / week_tasks_total * 100, 1) if week_tasks_total else 100.0,
            "week_avg_time_sec": round(week_avg_time, 2),
        }
    except Exception as e:
        import logging
        logging.error(f"获取看板统计失败: {e}")
        return {
            "total_files": 0,
            "today_files": 0,
            "week_files": 0,
            "week_tasks_total": 0,
            "week_tasks_success": 0,
            "week_success_rate": 100.0,
            "week_avg_time_sec": 0.0,
        }
    finally:
        if conn:
            conn.close()


def get_task_trend(days=7):
    """按日统计任务量，用于趋势图"""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            """SELECT date(created_at) as d, SUM(file_count) as cnt, SUM(success_count) as ok
               FROM task_stats
               WHERE created_at >= date('now', 'localtime', ?)
               GROUP BY date(created_at)
               ORDER BY d""",
            (f"-{days} days",),
        )
        rows = c.fetchall()
        return [{"date": r[0], "file_count": r[1] or 0, "success_count": r[2] or 0} for r in rows]
    except Exception as e:
        import logging
        logging.error(f"获取任务趋势失败: {e}")
        return []
    finally:
        if conn:
            conn.close()
