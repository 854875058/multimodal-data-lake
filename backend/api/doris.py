# -*- coding: utf-8 -*-
"""Doris MPP 集群管理 API - 原生实现，基于 MySQL 协议直连 Doris"""

import logging
import sqlite3
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import DB_PATH

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── SQLite 初始化 ───────────────────────────────────────────────────────────

def init_doris_tables():
    """初始化 Doris 集群相关 SQLite 表"""
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS doris_clusters (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                fe_host TEXT NOT NULL,
                fe_query_port INTEGER DEFAULT 9030,
                fe_http_port INTEGER DEFAULT 8030,
                username TEXT DEFAULT 'root',
                password TEXT DEFAULT '',
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS doris_alerts (
                id TEXT PRIMARY KEY,
                cluster_id TEXT NOT NULL,
                name TEXT NOT NULL,
                metric TEXT NOT NULL,
                operator TEXT DEFAULT '>',
                threshold REAL NOT NULL,
                level TEXT DEFAULT 'WARNING',
                enabled INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS doris_alert_records (
                id TEXT PRIMARY KEY,
                cluster_id TEXT NOT NULL,
                alert_id TEXT,
                name TEXT NOT NULL,
                metric TEXT,
                value REAL,
                level TEXT DEFAULT 'WARNING',
                message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS doris_inspection_history (
                id TEXT PRIMARY KEY,
                cluster_id TEXT NOT NULL,
                status TEXT DEFAULT 'RUNNING',
                score REAL,
                check_count INTEGER DEFAULT 0,
                duration REAL,
                result_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
    finally:
        conn.close()


# ─── Doris 连接工具 ──────────────────────────────────────────────────────────

def _get_doris_conn(cluster_id: str):
    """获取 Doris MySQL 协议连接"""
    try:
        import pymysql
    except ImportError:
        raise HTTPException(status_code=503, detail="pymysql 未安装，请执行: pip install pymysql")

    cluster = _get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail=f"集群 {cluster_id} 不存在")

    try:
        conn = pymysql.connect(
            host=cluster["fe_host"],
            port=cluster["fe_query_port"],
            user=cluster["username"],
            password=cluster["password"],
            database="information_schema",
            connect_timeout=10,
            charset="utf8mb4",
        )
        return conn
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Doris 连接失败: {str(e)}")


def _get_cluster(cluster_id: str) -> Optional[dict]:
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM doris_clusters WHERE id=?", (cluster_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def _list_clusters() -> List[dict]:
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM doris_clusters ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ─── Pydantic 模型 ───────────────────────────────────────────────────────────

class ClusterCreate(BaseModel):
    name: str
    fe_host: str
    fe_query_port: int = 9030
    fe_http_port: int = 8030
    username: str = "root"
    password: str = ""
    description: Optional[str] = None


class ClusterUpdate(BaseModel):
    name: Optional[str] = None
    fe_host: Optional[str] = None
    fe_query_port: Optional[int] = None
    fe_http_port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    description: Optional[str] = None


class SqlRequest(BaseModel):
    cluster_id: str
    sql: str
    limit: int = 500


class AlertCreate(BaseModel):
    cluster_id: str
    name: str
    metric: str
    operator: str = ">"
    threshold: float
    level: str = "WARNING"


class InspectionRequest(BaseModel):
    cluster_id: str


# ─── 集群 CRUD ───────────────────────────────────────────────────────────────

@router.get("/clusters")
async def list_clusters():
    """列出所有已注册的 Doris 集群"""
    clusters = _list_clusters()
    return {"success": True, "clusters": clusters, "total": len(clusters)}


@router.post("/clusters")
async def create_cluster(req: ClusterCreate):
    """注册新的 Doris 集群"""
    cluster_id = str(uuid.uuid4())
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            """INSERT INTO doris_clusters (id, name, fe_host, fe_query_port, fe_http_port,
               username, password, description) VALUES (?,?,?,?,?,?,?,?)""",
            (cluster_id, req.name, req.fe_host, req.fe_query_port, req.fe_http_port,
             req.username, req.password, req.description or ""),
        )
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "id": cluster_id, "message": f"集群 {req.name} 注册成功"}


@router.put("/clusters/{cluster_id}")
async def update_cluster(cluster_id: str, req: ClusterUpdate):
    """更新集群连接信息"""
    cluster = _get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")
    updates = {k: v for k, v in req.dict().items() if v is not None}
    if not updates:
        return {"success": True, "message": "无变更"}
    set_clause = ", ".join(f"{k}=?" for k in updates)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            f"UPDATE doris_clusters SET {set_clause}, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            [*updates.values(), cluster_id],
        )
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "message": "集群信息已更新"}


@router.delete("/clusters/{cluster_id}")
async def delete_cluster(cluster_id: str):
    """删除已注册的集群"""
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("DELETE FROM doris_clusters WHERE id=?", (cluster_id,))
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "message": "集群已删除"}


@router.get("/clusters/{cluster_id}")
async def get_cluster_detail(cluster_id: str):
    """获取集群详情"""
    cluster = _get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")
    return {"success": True, "cluster": cluster}


# ─── 集群状态 & 节点 ─────────────────────────────────────────────────────────

@router.get("/clusters/{cluster_id}/status")
async def get_cluster_status(cluster_id: str):
    """获取集群节点状态（通过 Doris SHOW 命令）"""
    try:
        conn = _get_doris_conn(cluster_id)
        cur = conn.cursor()

        # FE 节点
        fe_nodes = []
        try:
            cur.execute("SHOW FRONTENDS")
            cols = [d[0] for d in cur.description]
            for row in cur.fetchall():
                r = dict(zip(cols, row))
                fe_nodes.append({
                    "host": r.get("Host") or r.get("IP", ""),
                    "port": r.get("QueryPort", ""),
                    "http_port": r.get("HttpPort", ""),
                    "alive": str(r.get("Alive", "")).lower() == "true",
                    "role": r.get("Role", ""),
                    "is_master": str(r.get("IsMaster", "")).lower() == "true",
                    "join_time": r.get("Join", ""),
                    "last_heartbeat": r.get("LastStartupTime", ""),
                })
        except Exception as e:
            logger.warning(f"SHOW FRONTENDS 失败: {e}")

        # BE 节点
        be_nodes = []
        try:
            cur.execute("SHOW BACKENDS")
            cols = [d[0] for d in cur.description]
            for row in cur.fetchall():
                r = dict(zip(cols, row))
                be_nodes.append({
                    "host": r.get("Host") or r.get("IP", ""),
                    "port": r.get("HeartbeatPort", ""),
                    "be_port": r.get("BePort", ""),
                    "http_port": r.get("HttpPort", ""),
                    "alive": str(r.get("Alive", "")).lower() == "true",
                    "total_capacity": r.get("TotalCapacity", ""),
                    "used_capacity": r.get("UsedCapacity", ""),
                    "data_used_capacity": r.get("DataUsedCapacity", ""),
                    "last_heartbeat": r.get("LastStartupTime", ""),
                })
        except Exception as e:
            logger.warning(f"SHOW BACKENDS 失败: {e}")

        conn.close()
        return {
            "success": True,
            "fe_nodes": fe_nodes,
            "be_nodes": be_nodes,
            "fe_count": len(fe_nodes),
            "be_count": len(be_nodes),
            "connected": True,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取集群状态失败: {e}")
        return {"success": False, "error": str(e), "connected": False, "fe_nodes": [], "be_nodes": []}


@router.post("/clusters/{cluster_id}/test")
async def test_cluster_connection(cluster_id: str):
    """测试集群连接"""
    try:
        conn = _get_doris_conn(cluster_id)
        cur = conn.cursor()
        cur.execute("SELECT version()")
        version = cur.fetchone()[0]
        conn.close()
        return {"success": True, "version": version, "message": "连接成功"}
    except HTTPException as e:
        return {"success": False, "message": e.detail}
    except Exception as e:
        return {"success": False, "message": str(e)}


# ─── SQL 执行 ────────────────────────────────────────────────────────────────

@router.post("/sql/execute")
async def execute_sql(req: SqlRequest):
    """在指定集群执行 SQL"""
    sql = req.sql.strip()
    if not sql:
        raise HTTPException(status_code=400, detail="SQL 不能为空")

    # 安全限制：禁止危险操作
    sql_upper = sql.upper()
    forbidden = ["DROP DATABASE", "DROP TABLE", "TRUNCATE", "DELETE FROM", "UPDATE "]
    for kw in forbidden:
        if kw in sql_upper and "WHERE" not in sql_upper:
            raise HTTPException(status_code=400, detail=f"危险操作需要 WHERE 条件: {kw}")

    try:
        import time
        conn = _get_doris_conn(req.cluster_id)
        cur = conn.cursor()
        start = time.time()
        cur.execute(sql)
        elapsed = round(time.time() - start, 3)

        if cur.description:
            columns = [d[0] for d in cur.description]
            rows = cur.fetchmany(req.limit)
            data = [dict(zip(columns, row)) for row in rows]
            total = cur.rowcount if cur.rowcount >= 0 else len(data)
            conn.close()
            return {
                "success": True,
                "columns": columns,
                "rows": data,
                "total": total,
                "elapsed": elapsed,
                "has_more": len(data) >= req.limit,
            }
        else:
            affected = cur.rowcount
            conn.commit()
            conn.close()
            return {
                "success": True,
                "columns": [],
                "rows": [],
                "total": 0,
                "affected_rows": affected,
                "elapsed": elapsed,
                "message": f"执行成功，影响 {affected} 行",
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"SQL 执行失败: {e}")
        raise HTTPException(status_code=400, detail=f"SQL 执行失败: {str(e)}")


@router.get("/sql/databases")
async def list_databases(cluster_id: str):
    """获取数据库列表"""
    try:
        conn = _get_doris_conn(cluster_id)
        cur = conn.cursor()
        cur.execute("SHOW DATABASES")
        dbs = [row[0] for row in cur.fetchall()]
        conn.close()
        return {"success": True, "databases": dbs}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sql/tables")
async def list_tables(cluster_id: str, database: str):
    """获取指定数据库的表列表"""
    try:
        conn = _get_doris_conn(cluster_id)
        cur = conn.cursor()
        cur.execute(f"SHOW TABLES FROM `{database}`")
        tables = [row[0] for row in cur.fetchall()]
        conn.close()
        return {"success": True, "tables": tables}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── 告警管理 ────────────────────────────────────────────────────────────────

@router.get("/alerts")
async def list_alerts(cluster_id: Optional[str] = None):
    """获取告警规则列表"""
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.row_factory = sqlite3.Row
        if cluster_id:
            rows = conn.execute(
                "SELECT * FROM doris_alerts WHERE cluster_id=? ORDER BY created_at DESC", (cluster_id,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM doris_alerts ORDER BY created_at DESC"
            ).fetchall()
        return {"success": True, "alerts": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.post("/alerts")
async def create_alert(req: AlertCreate):
    """创建告警规则"""
    alert_id = str(uuid.uuid4())
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            """INSERT INTO doris_alerts (id, cluster_id, name, metric, operator, threshold, level)
               VALUES (?,?,?,?,?,?,?)""",
            (alert_id, req.cluster_id, req.name, req.metric, req.operator, req.threshold, req.level),
        )
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "id": alert_id, "message": "告警规则创建成功"}


@router.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: str):
    """删除告警规则"""
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("DELETE FROM doris_alerts WHERE id=?", (alert_id,))
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "message": "告警规则已删除"}


@router.get("/alerts/records")
async def list_alert_records(cluster_id: Optional[str] = None, limit: int = 50):
    """获取告警记录"""
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.row_factory = sqlite3.Row
        if cluster_id:
            rows = conn.execute(
                "SELECT * FROM doris_alert_records WHERE cluster_id=? ORDER BY created_at DESC LIMIT ?",
                (cluster_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM doris_alert_records ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return {"success": True, "records": [dict(r) for r in rows]}
    finally:
        conn.close()


# ─── 巡检 ────────────────────────────────────────────────────────────────────

@router.post("/inspection/run")
async def run_inspection(req: InspectionRequest):
    """执行集群巡检"""
    import json, threading

    inspection_id = str(uuid.uuid4())
    cluster_id = req.cluster_id

    # 先记录巡检任务
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            """INSERT INTO doris_inspection_history (id, cluster_id, status, check_count, created_at)
               VALUES (?,?,?,?,CURRENT_TIMESTAMP)""",
            (inspection_id, cluster_id, "RUNNING", 0),
        )
        conn.commit()
    finally:
        conn.close()

    def _do_inspection():
        items = []
        score = 100.0
        start = datetime.now()

        try:
            doris_conn = _get_doris_conn(cluster_id)
            cur = doris_conn.cursor()

            # 检查项 1: FE 节点存活
            try:
                cur.execute("SHOW FRONTENDS")
                cols = [d[0] for d in cur.description]
                frontends = [dict(zip(cols, r)) for r in cur.fetchall()]
                alive_fe = sum(1 for f in frontends if str(f.get("Alive", "")).lower() == "true")
                total_fe = len(frontends)
                status = "SUCCESS" if alive_fe == total_fe else "FAILED"
                if status == "FAILED":
                    score -= 20
                items.append({
                    "name": "FE 节点存活检查",
                    "status": status,
                    "value": f"{alive_fe}/{total_fe} 存活",
                    "suggestion": "检查 FE 节点进程状态" if status == "FAILED" else "",
                })
            except Exception as e:
                items.append({"name": "FE 节点存活检查", "status": "FAILED", "value": str(e), "suggestion": "无法连接 FE"})
                score -= 20

            # 检查项 2: BE 节点存活
            try:
                cur.execute("SHOW BACKENDS")
                cols = [d[0] for d in cur.description]
                backends = [dict(zip(cols, r)) for r in cur.fetchall()]
                alive_be = sum(1 for b in backends if str(b.get("Alive", "")).lower() == "true")
                total_be = len(backends)
                status = "SUCCESS" if alive_be == total_be and total_be > 0 else "FAILED"
                if status == "FAILED":
                    score -= 30
                items.append({
                    "name": "BE 节点存活检查",
                    "status": status,
                    "value": f"{alive_be}/{total_be} 存活",
                    "suggestion": "检查 BE 节点进程状态" if status == "FAILED" else "",
                })
            except Exception as e:
                items.append({"name": "BE 节点存活检查", "status": "FAILED", "value": str(e), "suggestion": "无法查询 BE"})
                score -= 30

            # 检查项 3: 磁盘使用率
            try:
                cur.execute("SHOW BACKENDS")
                cols = [d[0] for d in cur.description]
                backends = [dict(zip(cols, r)) for r in cur.fetchall()]
                max_usage = 0.0
                for b in backends:
                    used = b.get("DataUsedCapacity", "0") or "0"
                    total = b.get("TotalCapacity", "0") or "0"
                    try:
                        used_bytes = _parse_capacity(str(used))
                        total_bytes = _parse_capacity(str(total))
                        if total_bytes > 0:
                            max_usage = max(max_usage, used_bytes / total_bytes * 100)
                    except Exception:
                        pass
                status = "SUCCESS" if max_usage < 80 else ("WARNING" if max_usage < 90 else "FAILED")
                if status == "FAILED":
                    score -= 20
                elif status == "WARNING":
                    score -= 10
                items.append({
                    "name": "磁盘使用率检查",
                    "status": status,
                    "value": f"最高 {max_usage:.1f}%",
                    "suggestion": "考虑扩容 BE 节点" if status != "SUCCESS" else "",
                })
            except Exception as e:
                items.append({"name": "磁盘使用率检查", "status": "WARNING", "value": "无法获取磁盘信息", "suggestion": str(e)})

            # 检查项 4: 连接数
            try:
                cur.execute("SHOW PROCESSLIST")
                proc_count = len(cur.fetchall())
                status = "SUCCESS" if proc_count < 1000 else "WARNING"
                if status == "WARNING":
                    score -= 5
                items.append({
                    "name": "连接数检查",
                    "status": status,
                    "value": f"当前 {proc_count} 个连接",
                    "suggestion": "连接数偏多，考虑优化连接池" if status == "WARNING" else "",
                })
            except Exception as e:
                items.append({"name": "连接数检查", "status": "WARNING", "value": "无法获取连接信息", "suggestion": str(e)})

            doris_conn.close()

        except Exception as e:
            items.append({"name": "集群连通性", "status": "FAILED", "value": str(e), "suggestion": "检查 FE 地址和端口"})
            score -= 50

        elapsed = (datetime.now() - start).total_seconds()
        score = max(0.0, min(100.0, score))

        # 更新结果
        result_json = json.dumps({"items": items}, ensure_ascii=False)
        conn2 = sqlite3.connect(DB_PATH)
        try:
            conn2.execute(
                """UPDATE doris_inspection_history
                   SET status=?, score=?, check_count=?, duration=?, result_json=?
                   WHERE id=?""",
                ("SUCCESS", score, len(items), round(elapsed, 2), result_json, inspection_id),
            )
            conn2.commit()
        finally:
            conn2.close()

    threading.Thread(target=_do_inspection, daemon=True).start()
    return {"success": True, "inspection_id": inspection_id, "message": "巡检任务已启动"}


def _parse_capacity(s: str) -> float:
    """解析 Doris 容量字符串，如 '100.000 GB' -> bytes"""
    s = s.strip()
    multipliers = {"B": 1, "KB": 1024, "MB": 1024**2, "GB": 1024**3, "TB": 1024**4}
    for unit, mult in sorted(multipliers.items(), key=lambda x: -len(x[0])):
        if s.upper().endswith(unit):
            try:
                return float(s[:-len(unit)].strip()) * mult
            except Exception:
                return 0.0
    try:
        return float(s)
    except Exception:
        return 0.0


@router.get("/inspection/history")
async def get_inspection_history(cluster_id: str, limit: int = 20):
    """获取巡检历史"""
    import json as _json
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT id, cluster_id, status, score, check_count, duration, result_json, created_at
               FROM doris_inspection_history WHERE cluster_id=?
               ORDER BY created_at DESC LIMIT ?""",
            (cluster_id, limit),
        ).fetchall()
        result = []
        for r in rows:
            item = dict(r)
            try:
                item["result"] = _json.loads(item.pop("result_json") or "{}")
            except Exception:
                item["result"] = {}
            result.append(item)
        return {"success": True, "history": result}
    finally:
        conn.close()


@router.get("/inspection/{inspection_id}")
async def get_inspection_result(inspection_id: str):
    """获取单次巡检结果"""
    import json as _json
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM doris_inspection_history WHERE id=?", (inspection_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="巡检记录不存在")
        item = dict(row)
        try:
            item["result"] = _json.loads(item.pop("result_json") or "{}")
        except Exception:
            item["result"] = {}
        return {"success": True, "inspection": item}
    finally:
        conn.close()