"""
多模态数据湖统一管理平台
BONC · Apache Gravitino · Ray AI Platform · SeaweedFS · Lance · Doris

修复说明：
- 所有重型依赖（lance/transformers/pymysql/fitz）改为延迟导入，避免未安装时崩溃
- LanceConverter 不在全局实例化，改为按需创建
- Gradio 6.x 兼容：theme/css 移到 launch()，移除 headers/max_rows 等废弃参数
- gr.Switch → gr.Checkbox；gr.File 返回值适配（取 .name 路径）
- connect_doris 中 port 强转 int
- vector_search 中的 BERT 加载改为 mock 模式，避免网络下载
"""
import json
import time
import datetime
import os
import random
from typing import Dict, List, Optional

# ── 必须在所有 matplotlib/PIL 导入之前设置后端，避免 MatplotlibBackendMananger 冲突 ──
import matplotlib
matplotlib.use("Agg")

import numpy as np
import pandas as pd
import requests
import gradio as gr

# ─────────────────────────────────────────────
#  延迟导入辅助（避免未安装包时启动崩溃）
# ─────────────────────────────────────────────
def _try_import(module_name: str):
    """尝试导入模块，失败返回 None"""
    try:
        import importlib
        return importlib.import_module(module_name)
    except ImportError:
        return None

# ─────────────────────────────────────────────
#  全局常量 & Mock 数据
# ─────────────────────────────────────────────
MOCK_CATALOGS = ["hive_catalog", "lakehouse_catalog", "doris_catalog"]
MOCK_SCHEMAS = {
    "hive_catalog":      ["default", "ods", "dwd", "ads"],
    "lakehouse_catalog": ["default", "multimodal", "vector_db"],
    "doris_catalog":     ["default", "federated", "vector_search"],
}
MOCK_TABLES = {
    "default":       ["user_profile", "product_images", "contract_docs", "order_data"],
    "ods":           ["raw_user_behavior", "raw_product_views"],
    "dwd":           ["dim_user", "dim_product", "fact_order"],
    "ads":           ["ads_sales_summary", "ads_user_retention"],
    "multimodal":    ["image_vectors", "pdf_vectors", "video_frames"],
    "vector_db":     ["text_embeddings", "cross_modal_index"],
    "federated":     ["seaweedfs_external_table", "lance_vector_table"],
    "vector_search": ["semantic_search_results"],
}
MOCK_JOBS = [
    {
        "job_id":     "job-1740460800",
        "status":     "SUCCEEDED",
        "entrypoint": "python etl_daft.py --input lance://seaweedfs/image_vectors --output doris://federated/result",
        "start_time": "2026-02-25 09:00:00",
        "duration":   "00:05:23",
        "resources":  "CPU:4, GPU:1, Memory:16GB",
        "type":       "Daft ETL + 向量化",
    },
    {
        "job_id":     "job-1740457200",
        "status":     "RUNNING",
        "entrypoint": "python pdf_to_lance.py --input s3://docs/contracts --output seaweedfs://multimodal/pdf_vectors",
        "start_time": "2026-02-25 08:00:00",
        "duration":   "01:00:15",
        "resources":  "CPU:2, GPU:0, Memory:8GB",
        "type":       "PDF 转 Lance 向量",
    },
    {
        "job_id":     "job-1740453600",
        "status":     "FAILED",
        "entrypoint": "python image_etl.py --input seaweedfs://raw_images --output lance://vectors",
        "start_time": "2026-02-25 07:00:00",
        "duration":   "00:02:47",
        "resources":  "CPU:8, GPU:2, Memory:32GB",
        "type":       "图像向量化 ETL",
    },
]

MOCK_SEAWEEDFS_FILES = [
    {"file_id": "mock_multimodal_001", "name": "product_img_001.jpg", "size": "2.3 MB", "type": "image", "collection": "multimodal"},
    {"file_id": "mock_multimodal_002", "name": "contract_2026.pdf",   "size": "1.1 MB", "type": "pdf",   "collection": "multimodal"},
    {"file_id": "mock_multimodal_003", "name": "user_avatar_003.png", "size": "0.5 MB", "type": "image", "collection": "multimodal"},
]

MOCK_DORIS_RESULT = [
    {"file_path": "seaweedfs://multimodal/img_001.jpg", "type": "image", "similarity": 0.12, "create_time": "2026-02-25"},
    {"file_path": "seaweedfs://multimodal/img_002.jpg", "type": "image", "similarity": 0.24, "create_time": "2026-02-24"},
    {"file_path": "seaweedfs://multimodal/doc_001.pdf", "type": "pdf",   "similarity": 0.38, "create_time": "2026-02-23"},
]

# ─────────────────────────────────────────────
#  CSS（字节风格，浅色系）
# ─────────────────────────────────────────────
CUSTOM_CSS = """
/* ── 全局字体 ── */
.gradio-container {
    font-family: 'PingFang SC', 'Microsoft YaHei', 'Inter', sans-serif !important;
    background-color: #f5f7fa !important;
}

/* ── Header ── */
.main-header {
    background: #ffffff;
    padding: 16px 24px;
    border-bottom: 2px solid #e8f3ff;
    margin-bottom: 16px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.main-header h1 {
    font-size: 20px;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
}
.main-header p {
    font-size: 13px;
    color: #64748b;
    margin: 4px 0 0 0;
}
.bonc-logo {
    font-size: 26px;
    font-weight: 900;
    color: #0066ff;
    letter-spacing: 2px;
    background: linear-gradient(135deg, #0066ff, #2563eb);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    padding: 4px 12px;
    border: 2px solid #0066ff;
    border-radius: 6px;
    display: inline-block;
    min-width: 80px;
    text-align: center;
}

/* ── 徽章 ── */
.badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
}
.badge-blue   { background: #e8f3ff; color: #0066ff; border: 1px solid #bfdbfe; }
.badge-green  { background: #e8f8e8; color: #16a34a; border: 1px solid #bbf7d0; }
.badge-orange { background: #fff3e8; color: #ff7d00; border: 1px solid #fed7aa; }

/* ── 状态栏 ── */
.status-bar {
    padding: 8px 16px;
    border-radius: 8px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    margin: 8px 0;
    font-size: 13px;
}
.status-item { display: flex; align-items: center; gap: 8px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot-green { background: #22c55e; }
.dot-red   { background: #ef4444; }
.dot-gray  { background: #94a3b8; }

/* ── 卡片 ── */
.asset-card {
    background: #ffffff;
    border-radius: 8px;
    padding: 14px;
    margin: 8px 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    border: 1px solid #e2e8f0;
}

/* ── 工作流节点 ── */
.workflow-node textarea {
    background: #f8fafc !important;
    border: 1px solid #e2e8f0 !important;
    color: #334155 !important;
}

/* ── 代码区 ── */
.code-area textarea, .code-area .cm-content {
    font-family: 'Consolas', 'JetBrains Mono', monospace !important;
    font-size: 13px !important;
    background: #f8fafc !important;
    color: #1e293b !important;
}

/* ── 表格 ── */
table th { background: #f5f7fa !important; color: #334155 !important; font-size: 12px !important; }
table td { font-size: 13px !important; color: #334155 !important; }
table tr:hover td { background: #e8f3ff !important; }

/* ── 按钮 ── */
.btn-primary { background: linear-gradient(135deg,#0066ff,#2563eb) !important; }

/* ── 分割线标题 ── */
.section-title {
    color: #0066ff;
    font-size: 15px;
    font-weight: 600;
    border-left: 3px solid #0066ff;
    padding-left: 8px;
    margin: 12px 0 8px 0;
}
"""

# ─────────────────────────────────────────────
#  ① 基础客户端类（Gravitino / Ray）
# ─────────────────────────────────────────────
class GravitinoClient:
    """封装 Apache Gravitino REST API"""
    def __init__(self, server_url: str = "http://localhost:8090", metalake: str = "demo_lake"):
        self.base_url = server_url.rstrip("/")
        self.metalake = metalake
        self.session = requests.Session()
        # 连接诊断信息，供 connect_gravitino 读取
        self.last_error: str = ""
        self.connected: bool = False

    def test_connection(self) -> tuple:
        """
        测试连接可用性。
        先探测 /api/version，再探测 /api/metalakes/{metalake}/catalogs。
        返回 (ok: bool, message: str)
        """
        # Step 1: 服务是否可达
        try:
            r = self.session.get(f"{self.base_url}/api/version", timeout=5)
            r.raise_for_status()
        except requests.exceptions.ConnectionError as e:
            return False, f"网络不可达：无法连接到 {self.base_url}（{e}）"
        except requests.exceptions.Timeout:
            return False, f"连接超时：{self.base_url} 在 5 秒内未响应"
        except requests.exceptions.HTTPError as e:
            # 某些版本没有 /api/version，继续尝试 metalake 接口
            pass
        except Exception as e:
            return False, f"未知错误：{e}"

        # Step 2: metalake 接口是否正常
        url = f"{self.base_url}/api/metalakes/{self.metalake}/catalogs"
        try:
            r = self.session.get(url, timeout=5)
            if r.status_code == 404:
                return False, (
                    f"Metalake「{self.metalake}」不存在（HTTP 404）\n"
                    f"请检查 Metalake 名称是否正确，或先在 Gravitino 中创建该 Metalake。"
                )
            if r.status_code == 401:
                return False, "认证失败（HTTP 401），请检查账号密码或 Token。"
            r.raise_for_status()
            return True, f"连接成功（{self.base_url}）"
        except requests.exceptions.HTTPError as e:
            return False, f"API 返回错误：HTTP {r.status_code} — {r.text[:200]}"
        except Exception as e:
            return False, f"Catalog 接口异常：{e}"

    def get_catalogs(self) -> List[str]:
        try:
            resp = self.session.get(
                f"{self.base_url}/api/metalakes/{self.metalake}/catalogs", timeout=5)
            resp.raise_for_status()
            data = resp.json()
            # Gravitino REST API 返回结构：{"catalogs": [...]} 或 {"identifiers": [...]}
            items = data.get("catalogs", data.get("identifiers", []))
            names = []
            for item in items:
                # 兼容两种结构：{"name": "xxx"} 或 {"name": "xxx", "namespace": [...]}
                n = item.get("name") or item.get("catalogName", "")
                if n:
                    names.append(n)
            self.connected = True
            return names if names else MOCK_CATALOGS
        except Exception as e:
            self.last_error = str(e)
            self.connected = False
            return MOCK_CATALOGS

    def get_schemas(self, catalog: str) -> List[str]:
        try:
            resp = self.session.get(
                f"{self.base_url}/api/metalakes/{self.metalake}/catalogs/{catalog}/schemas",
                timeout=5)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("schemas", data.get("identifiers", []))
            names = [i.get("name") or i.get("schemaName", "") for i in items if i.get("name") or i.get("schemaName")]
            return names if names else MOCK_SCHEMAS.get(catalog, MOCK_SCHEMAS["hive_catalog"])
        except Exception:
            return MOCK_SCHEMAS.get(catalog, MOCK_SCHEMAS["hive_catalog"])

    def get_tables(self, catalog: str, schema: str) -> List[str]:
        try:
            resp = self.session.get(
                f"{self.base_url}/api/metalakes/{self.metalake}/catalogs/{catalog}/schemas/{schema}/tables",
                timeout=5)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("tables", data.get("identifiers", []))
            names = [i.get("name") or i.get("tableName", "") for i in items if i.get("name") or i.get("tableName")]
            return names if names else MOCK_TABLES.get(schema, MOCK_TABLES["default"])
        except Exception:
            return MOCK_TABLES.get(schema, MOCK_TABLES["default"])

    def get_table_details(self, catalog: str, schema: str, table: str) -> Dict:
        try:
            resp = self.session.get(
                f"{self.base_url}/api/metalakes/{self.metalake}/catalogs/{catalog}/schemas/{schema}/tables/{table}",
                timeout=5)
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return {
                "name": table,
                "type": "TABLE",
                "columns": [
                    {"name": "id",          "type": "INT"},
                    {"name": "name",        "type": "STRING"},
                    {"name": "vector",      "type": "ARRAY<FLOAT>"},
                    {"name": "create_time", "type": "TIMESTAMP"},
                ],
                "properties": {"storage.location": f"seaweedfs://{catalog}/{schema}/{table}"},
            }


class RayClient:
    """封装 Ray Dashboard REST API"""
    def __init__(self, dashboard_url: str = "http://localhost:8265"):
        self.base_url = dashboard_url.rstrip("/")
        self.session = requests.Session()

    def get_cluster_status(self) -> Dict:
        try:
            resp = self.session.get(f"{self.base_url}/api/cluster_status", timeout=5)
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return {
                "data": {
                    "clusterStatus": {
                        "totalNumCpus": 32,
                        "totalResourcesAvailable": {"memory": "128GB"},
                        "gpuUsage": {"total": 4, "used": 2},
                        "nodeCount": 8,
                    }
                }
            }

    def list_jobs(self) -> List[Dict]:
        try:
            resp = self.session.get(f"{self.base_url}/api/jobs", timeout=5)
            resp.raise_for_status()
            return resp.json().get("jobs", [])
        except Exception:
            return MOCK_JOBS

    def submit_job(self, entrypoint: str, runtime_env: Dict = None, job_id: str = "") -> Dict:
        try:
            payload = {"entrypoint": entrypoint, "runtime_env": runtime_env or {}, "job_id": job_id}
            resp = self.session.post(f"{self.base_url}/api/jobs", json=payload, timeout=10)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            return {"error": str(e)}

    def get_job(self, job_id: str) -> Dict:
        try:
            resp = self.session.get(f"{self.base_url}/api/jobs/{job_id}", timeout=5)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            return {"error": str(e)}

    def job_logs(self, job_id: str) -> str:
        try:
            resp = self.session.get(f"{self.base_url}/api/jobs/{job_id}/logs", timeout=5)
            resp.raise_for_status()
            return resp.text
        except Exception:
            now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            return (
                f"[Mock日志] 任务 {job_id} 运行日志（Ray集群未连接）\n"
                f"{now} INFO  任务启动\n"
                f"{now} INFO  加载 SeaweedFS Lance 数据...\n"
                f"{now} INFO  Daft ETL 处理中...\n"
                f"{now} INFO  向量化处理完成\n"
                f"{now} INFO  写入 Doris 联邦表完成\n"
            )

    def read_lance_from_seaweedfs(self, file_id: str, seaweed_client: "SeaweedFSClient") -> str:
        """Ray 零拷贝读取 SeaweedFS 中 Lance 数据（Mock 实现）"""
        try:
            volume_info = seaweed_client.lookup_volume(file_id)
            file_url = f"http://{volume_info.get('url', 'localhost:8080')}/{file_id}"
            # 真实场景：ray.remote + lance.dataset(url, filesystem=...)
            return f"[Mock LanceDataset] url={file_url}, rows=1000, dims=768"
        except Exception as e:
            return f"读取失败: {e}"


# ─────────────────────────────────────────────
#  ② 扩展客户端类（SeaweedFS / Lance / Doris）
# ─────────────────────────────────────────────
class SeaweedFSClient:
    """封装 SeaweedFS Master REST API"""
    def __init__(self, master_url: str = "http://localhost:9333"):
        self.base_url = master_url.rstrip("/")
        self.session = requests.Session()

    def lookup_volume(self, file_id: str) -> Dict:
        """查询文件所在 volume 位置"""
        try:
            resp = self.session.get(f"{self.base_url}/dir/lookup?fileId={file_id}", timeout=5)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            return {"url": "localhost:8080", "error": str(e)}

    def upload_file(self, file_path: str, collection: str = "default") -> str:
        """上传文件，返回 SeaweedFS fid"""
        try:
            resp = self.session.get(f"{self.base_url}/dir/assign?collection={collection}", timeout=5)
            resp.raise_for_status()
            assign = resp.json()
            with open(file_path, "rb") as f:
                upload_resp = self.session.post(
                    f"http://{assign['url']}/{assign['fid']}", files={"file": f}, timeout=30)
            upload_resp.raise_for_status()
            return assign["fid"]
        except Exception:
            return f"mock_{collection}_{int(time.time())}"

    def download_file(self, file_id: str, save_path: str) -> bool:
        """下载文件"""
        try:
            volume_info = self.lookup_volume(file_id)
            resp = self.session.get(f"http://{volume_info['url']}/{file_id}", timeout=30)
            resp.raise_for_status()
            with open(save_path, "wb") as f:
                f.write(resp.content)
            return True
        except Exception:
            return False

    def delete_file(self, file_id: str) -> bool:
        """删除文件"""
        try:
            volume_info = self.lookup_volume(file_id)
            resp = self.session.delete(f"http://{volume_info['url']}/{file_id}", timeout=5)
            return resp.status_code == 200
        except Exception:
            return False

    def list_files(self, collection: str = "") -> List[Dict]:
        """列出文件（Mock 实现）"""
        return [f for f in MOCK_SEAWEEDFS_FILES
                if not collection or f["collection"] == collection]


class LanceConverter:
    """
    非结构化数据 → Lance 向量格式转换器。
    依赖：lance, pyarrow, Pillow, PyMuPDF, transformers（均为可选）
    未安装时自动降级为 Mock 模式。
    """
    def image_to_lance(self, image_path: str, output_path: str) -> Dict:
        """图片 → Lance（CLIP 视觉特征向量）"""
        try:
            pa = _try_import("pyarrow")
            lance = _try_import("lance")
            PIL_Image = _try_import("PIL.Image")

            if not all([pa, lance, PIL_Image]):
                raise ImportError("缺少依赖: pyarrow / lance / Pillow")

            # 尝试 CLIP，失败则用随机向量 Mock
            try:
                from transformers import CLIPProcessor, CLIPModel
                model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
                processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
                img = PIL_Image.open(image_path).convert("RGB")
                inputs = processor(images=img, return_tensors="pt")
                import torch
                with torch.no_grad():
                    vector = model.get_image_features(**inputs).numpy()[0].tolist()
                dims = len(vector)
            except Exception:
                vector = np.random.rand(512).tolist()
                dims = 512

            table = pa.table({
                "file_path":   pa.array([image_path]),
                "vector":      pa.array([vector], type=pa.list_(pa.float32(), dims)),
                "type":        pa.array(["image"]),
                "create_time": pa.array([datetime.datetime.now().isoformat()]),
            })
            lance.write_dataset(table, output_path, mode="overwrite")
            return {"status": "success", "output": output_path, "dims": dims, "rows": 1}
        except Exception as e:
            # Mock 成功返回，方便演示
            return {
                "status": "mock",
                "output": output_path,
                "dims": 512,
                "rows": 1,
                "note": f"Mock模式（{e}）",
            }

    def pdf_to_lance(self, pdf_path: str, output_path: str) -> Dict:
        """PDF → Lance（BERT 文本特征向量）"""
        try:
            pa = _try_import("pyarrow")
            lance = _try_import("lance")
            fitz = _try_import("fitz")

            if not all([pa, lance, fitz]):
                raise ImportError("缺少依赖: pyarrow / lance / PyMuPDF")

            doc = fitz.open(pdf_path)
            text = "\n".join([page.get_text() for page in doc])
            doc.close()

            # 尝试 BERT，失败则用随机向量
            try:
                from transformers import AutoTokenizer, AutoModel
                import torch
                tokenizer = AutoTokenizer.from_pretrained("bert-base-chinese")
                model = AutoModel.from_pretrained("bert-base-chinese")
                inputs = tokenizer(text, return_tensors="pt", padding=True,
                                   truncation=True, max_length=512)
                with torch.no_grad():
                    vector = model(**inputs).last_hidden_state.mean(dim=1).numpy()[0].tolist()
                dims = len(vector)
            except Exception:
                vector = np.random.rand(768).tolist()
                dims = 768

            table = pa.table({
                "file_path":   pa.array([pdf_path]),
                "vector":      pa.array([vector], type=pa.list_(pa.float32(), dims)),
                "type":        pa.array(["pdf"]),
                "create_time": pa.array([datetime.datetime.now().isoformat()]),
            })
            lance.write_dataset(table, output_path, mode="overwrite")
            return {"status": "success", "output": output_path, "dims": dims, "rows": 1}
        except Exception as e:
            return {
                "status": "mock",
                "output": output_path,
                "dims": 768,
                "rows": 1,
                "note": f"Mock模式（{e}）",
            }


class DorisClient:
    """封装 Apache Doris FE MySQL 协议接口"""
    def __init__(self, host: str = "localhost", port: int = 9030,
                 user: str = "root", password: str = "", db: str = "default"):
        self.host = host
        self.port = int(port)   # gr.Number 传入 float，强制转 int
        self.user = user
        self.password = password
        self.db = db
        self.conn = None

    def connect(self) -> bool:
        """连接 Doris（通过 MySQL 协议）"""
        pymysql = _try_import("pymysql")
        if pymysql is None:
            return False
        try:
            self.conn = pymysql.connect(
                host=self.host, port=self.port,
                user=self.user, password=self.password,
                db=self.db, charset="utf8mb4",
                connect_timeout=5,
            )
            return True
        except Exception:
            return False

    def execute_sql(self, sql: str) -> List[Dict]:
        """执行 SQL 并返回结果列表"""
        pymysql = _try_import("pymysql")
        if pymysql is None or not self.conn:
            if pymysql is None or not self.connect():
                # Mock 结果
                return MOCK_DORIS_RESULT
        try:
            with self.conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(sql)
                if sql.strip().upper().startswith("SELECT"):
                    return list(cursor.fetchall())
                else:
                    self.conn.commit()
                    return [{"result": f"执行成功，影响行数: {cursor.rowcount}"}]
        except Exception as e:
            return [{"error": str(e)}]

    def create_seaweedfs_external_table(self, table_name: str,
                                        seaweedfs_path: str, file_format: str = "lance") -> str:
        """生成并执行 Doris SeaweedFS 外表 DDL"""
        create_sql = f"""CREATE EXTERNAL TABLE IF NOT EXISTS {table_name} (
    file_path   VARCHAR(512),
    vector      ARRAY<FLOAT>,
    type        VARCHAR(32),
    create_time VARCHAR(32)
)
ENGINE = SEAWEEDFS
LOCATION = '{seaweedfs_path}'
PROPERTIES (
    "file_format"              = "{file_format}",
    "seaweedfs.master.address" = "http://localhost:9333"
);"""
        result = self.execute_sql(create_sql)
        if result and "error" in result[0]:
            return f"⚠️ 创建失败（Mock模式演示）:\n{create_sql}"
        return f"✅ 表 **{table_name}** 创建成功！\n\n```sql\n{create_sql}\n```"

    def vector_search(self, table_name: str, query_text: str, top_k: int = 5) -> List[Dict]:
        """向量相似度检索（Mock 实现，真实场景替换为 Doris 向量语法）"""
        rng = random.Random(hash(query_text) % 99999)
        results = []
        for i in range(min(top_k, len(MOCK_DORIS_RESULT))):
            item = dict(MOCK_DORIS_RESULT[i])
            item["similarity"] = round(rng.uniform(0.05, 0.45), 4)
            item["query"] = query_text
            results.append(item)
        results.sort(key=lambda x: x["similarity"])
        return results

    def nl2sql(self, natural_language: str) -> str:
        """自然语言 → Doris SQL（规则 Mock，可替换为 LLM）"""
        mapping = {
            "查询所有图片向量数据":   "SELECT * FROM image_vectors LIMIT 100;",
            "查询PDF类型的向量数据":  "SELECT file_path, create_time FROM pdf_vectors WHERE type = 'pdf';",
            "统计不同类型的文件数量": "SELECT type, COUNT(*) AS cnt FROM lance_vector_table GROUP BY type;",
        }
        sql = mapping.get(
            natural_language,
            f"-- 未匹配预设，请手动编写\n-- 原始输入: {natural_language}\nSELECT * FROM lance_vector_table LIMIT 10;"
        )
        return sql

    def nl2vector_search(self, semantic_desc: str) -> str:
        """语义描述 → 向量检索 SQL 模板"""
        return (
            f"-- 语义向量检索\n-- 描述: {semantic_desc}\n"
            "SELECT file_path, type,\n"
            "       vector_distance(vector, ENCODE_TEXT(:query_vec)) AS similarity\n"
            "FROM   lance_vector_table\n"
            "ORDER  BY similarity ASC\n"
            "LIMIT  10;"
        )


class VectorizedJobWrapper:
    """自动化向量化 Ray Job 封装器"""
    def wrap_etl_job(self, daft_etl_script: str, vector_config: Dict) -> str:
        """将普通 Daft ETL 脚本封装为向量化 Ray Job"""
        vector_template = f"""
# ── 自动注入：向量化 Ray Job 封装 ──────────────────────────
import ray
import daft
import lance
import numpy as np

ray.init(address="auto", ignore_reinit_error=True)

VECTOR_CONFIG = {json.dumps(vector_config, ensure_ascii=False)}

@ray.remote(num_cpus=VECTOR_CONFIG.get("num_workers", 2))
def vectorize_partition(records):
    from transformers import AutoTokenizer, AutoModel
    import torch
    tokenizer = AutoTokenizer.from_pretrained(VECTOR_CONFIG["model_name"])
    model     = AutoModel.from_pretrained(VECTOR_CONFIG["model_name"])
    results   = []
    for text in records:
        inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        with torch.no_grad():
            vec = model(**inputs).last_hidden_state.mean(dim=1).numpy()[0].tolist()
        results.append(vec)
    return results

# 读取 Lance 数据
df = daft.read_lance(VECTOR_CONFIG["input_path"])

# 分布式向量化
futures = [vectorize_partition.remote(batch) for batch in df.to_batches(100)]
vectors  = [v for chunk in ray.get(futures) for v in chunk]

# 写入结果
df = df.with_column("vector", daft.col("vector").apply(lambda x: vectors.pop(0)))
df.write_lance(VECTOR_CONFIG["output_path"])

print("✅ 向量化 ETL 完成！")
# ──────────────────────────────────────────────────────────
"""
        return daft_etl_script + vector_template


# ─────────────────────────────────────────────
#  全局客户端实例
# ─────────────────────────────────────────────
gravitino_client = GravitinoClient()
ray_client       = RayClient()
seaweed_client   = SeaweedFSClient()
lance_converter  = LanceConverter()
doris_client     = DorisClient()


# ─────────────────────────────────────────────
#  UI 辅助函数
# ─────────────────────────────────────────────
def _mock_cluster_info() -> str:
    return """
<div style="display:flex;gap:14px;margin:12px 0;flex-wrap:wrap;">
  <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center;flex:1;min-width:100px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
    <div style="color:#64748b;font-size:11px;text-transform:uppercase;">CPU 核心</div>
    <div style="color:#0066ff;font-size:26px;font-weight:700;">32</div>
    <div style="color:#22c55e;font-size:11px;">已用 8 / 32</div>
  </div>
  <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center;flex:1;min-width:100px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
    <div style="color:#64748b;font-size:11px;text-transform:uppercase;">GPU</div>
    <div style="color:#f59e0b;font-size:26px;font-weight:700;">4</div>
    <div style="color:#22c55e;font-size:11px;">已用 2 / 4</div>
  </div>
  <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center;flex:1;min-width:100px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
    <div style="color:#64748b;font-size:11px;text-transform:uppercase;">内存</div>
    <div style="color:#34d399;font-size:26px;font-weight:700;">128GB</div>
    <div style="color:#22c55e;font-size:11px;">已用 32 GB</div>
  </div>
  <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center;flex:1;min-width:100px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
    <div style="color:#64748b;font-size:11px;text-transform:uppercase;">工作节点</div>
    <div style="color:#34d399;font-size:26px;font-weight:700;">8</div>
    <div style="color:#22c55e;font-size:11px;">全部在线</div>
  </div>
</div>"""


def _build_asset_tree(catalog: str, schema: str, table: str) -> str:
    return f"""<div class="asset-card">
  <div style="font-weight:700;color:#0066ff;">📦 {catalog}</div>
  <div style="margin-left:16px;color:#16a34a;margin-top:4px;">📂 {schema}</div>
  <div style="margin-left:32px;color:#334155;margin-top:4px;">📄 {table}</div>
  <div style="margin-top:10px;font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:8px;">
    <div>存储: <code>seaweedfs://{catalog}/{schema}/{table}</code></div>
    <div>格式: Lance &nbsp;|&nbsp; 向量维度: 768</div>
  </div>
</div>"""


def _jobs_to_df(jobs: List[Dict]) -> pd.DataFrame:
    STATUS_ICON = {
        "SUCCEEDED": "✅ SUCCEEDED",
        "RUNNING":   "🔄 RUNNING",
        "FAILED":    "❌ FAILED",
        "PENDING":   "⏳ PENDING",
    }
    rows = []
    for j in jobs:
        ep = j.get("entrypoint", "")
        rows.append({
            "任务ID":   j.get("job_id", ""),
            "状态":     STATUS_ICON.get(j.get("status", ""), j.get("status", "")),
            "入口命令": ep[:48] + "..." if len(ep) > 48 else ep,
            "开始时间": j.get("start_time", ""),
            "耗时":     j.get("duration", ""),
            "资源":     j.get("resources", ""),
            "类型":     j.get("type", ""),
        })
    return pd.DataFrame(rows)


def _mock_dataframe(table: str) -> pd.DataFrame:
    rng = random.Random(hash(table) % 9999)
    rows = []
    for i in range(20):
        rows.append({
            "id":          i + 1,
            "name":        f"{table}_{i+1:03d}",
            "vector":      f"[{rng.uniform(-1,1):.3f}, {rng.uniform(-1,1):.3f}, ...]",
            "create_time": f"2026-02-{rng.randint(1,25):02d} {rng.randint(0,23):02d}:00:00",
        })
    return pd.DataFrame(rows)


# ─────────────────────────────────────────────
#  核心业务逻辑
# ─────────────────────────────────────────────
def connect_gravitino(g_url: str, g_ml: str):
    global gravitino_client
    import re
    # 兼容粘贴完整 UI 地址（如 http://host:port/ui/metalakes），自动提取 base URL
    clean_url = re.sub(r'/ui(/.*)?$', '', g_url.strip().rstrip('/'))

    gravitino_client = GravitinoClient(clean_url, g_ml)

    # 先做诊断性连接测试，拿到详细原因
    ok, diag_msg = gravitino_client.test_connection()

    if ok:
        catalogs = gravitino_client.get_catalogs()
        if not catalogs:
            catalogs = MOCK_CATALOGS
        dot = "dot-green"
        detail = f"Catalogs: {', '.join(catalogs)}"
        html = (
            f'<div class="status-bar" style="background:#f0fdf4;border-color:#bbf7d0;">'
            f'<span class="status-item">'
            f'<span class="status-dot dot-green"></span>'
            f'✅ {diag_msg} &nbsp;|&nbsp; Metalake: <b>{g_ml}</b> &nbsp;|&nbsp; {detail}'
            f'</span></div>'
        )
        return html, gr.Dropdown(choices=catalogs, value=catalogs[0])
    else:
        # 连接失败：仍加载 Mock 数据以保证 UI 可用，但给出详细诊断
        catalogs = MOCK_CATALOGS
        html = (
            f'<div class="status-bar" style="background:#fff7ed;border-color:#fed7aa;">'
            f'<span class="status-item">'
            f'<span class="status-dot dot-red"></span>'
            f'⚠️ <b>连接失败</b>，已切换为 Mock 数据<br>'
            f'<span style="color:#b45309;font-size:12px;margin-left:16px;">原因：{diag_msg}</span>'
            f'</span></div>'
        )
        return html, gr.Dropdown(choices=catalogs, value=catalogs[0])


def diagnose_gravitino(g_url: str, g_ml: str):
    """
    详细诊断 Gravitino 连接，在页面上显示原始 API 响应，帮助排查问题。
    返回 (markdown文本, visible=True)
    """
    import re
    clean_url = re.sub(r'/ui(/.*)?$', '', g_url.strip().rstrip('/'))
    lines = [f"## 🔍 Gravitino 连接诊断\n\n**目标地址**: `{clean_url}`  \n**Metalake**: `{g_ml}`\n"]

    # 1. 探测 /api/version
    try:
        r = requests.get(f"{clean_url}/api/version", timeout=5)
        lines.append(f"**① /api/version** → HTTP {r.status_code}\n```json\n{r.text[:500]}\n```")
    except Exception as e:
        lines.append(f"**① /api/version** → ❌ 异常: `{e}`")

    # 2. 探测 /api/metalakes
    try:
        r = requests.get(f"{clean_url}/api/metalakes", timeout=5)
        lines.append(f"**② /api/metalakes** → HTTP {r.status_code}\n```json\n{r.text[:800]}\n```")
    except Exception as e:
        lines.append(f"**② /api/metalakes** → ❌ 异常: `{e}`")

    # 3. 探测 /api/metalakes/{metalake}/catalogs
    try:
        r = requests.get(f"{clean_url}/api/metalakes/{g_ml}/catalogs", timeout=5)
        lines.append(f"**③ /api/metalakes/{g_ml}/catalogs** → HTTP {r.status_code}\n```json\n{r.text[:800]}\n```")
    except Exception as e:
        lines.append(f"**③ catalogs 接口** → ❌ 异常: `{e}`")

    result = "\n\n---\n\n".join(lines)
    return gr.Markdown(value=result, visible=True)


def connect_ray(ray_url: str):
    global ray_client
    ray_client = RayClient(ray_url)
    status = ray_client.get_cluster_status()
    ok = "error" not in status
    dot = "dot-green" if ok else "dot-red"
    msg = "已连接 Ray 集群" if ok else "连接失败 — 使用 Mock 数据"
    html = f'<div class="status-bar"><span class="status-item"><span class="status-dot {dot}"></span>{msg}</span></div>'
    return html, _mock_cluster_info()


def load_schemas(catalog: str):
    schemas = gravitino_client.get_schemas(catalog)
    return gr.Dropdown(choices=schemas, value=schemas[0] if schemas else "")


def load_tables(catalog: str, schema: str):
    tables = gravitino_client.get_tables(catalog, schema)
    return gr.Dropdown(choices=tables, value=tables[0] if tables else "")


def preview_asset(catalog: str, schema: str, table: str, preview_type: str):
    if not table:
        return None, None, "*请先选择表*", "<div style='color:#94a3b8;padding:8px;'>请先选择表</div>", ""

    tree = _build_asset_tree(catalog, schema, table)
    info = f'<div style="color:#0066ff;padding:8px;font-size:13px;">✅ {catalog}.{schema}.<b>{table}</b></div>'

    if preview_type == "数据预览":
        df = _mock_dataframe(table)
        return df, None, "*当前为表格数据预览*", info, tree

    elif preview_type == "Schema 信息":
        details = gravitino_client.get_table_details(catalog, schema, table)
        cols = details.get("columns", [])
        schema_df = pd.DataFrame([
            {"字段名": c["name"], "类型": c["type"]} for c in cols
        ])
        loc = details.get("properties", {}).get("storage.location", f"seaweedfs://{catalog}/{schema}/{table}")
        doc = f"**存储位置**: `{loc}`\n\n**类型**: {details.get('type','TABLE')}"
        return schema_df, None, doc, info, tree

    elif preview_type == "图像预览":
        try:
            rng = random.Random(hash(table) % 99999)
            img_arr = np.zeros((280, 440, 3), dtype=np.uint8)
            # 用纯 numpy 绘制彩色圆形，避免触发 matplotlib/PIL 后端冲突
            yy, xx = np.mgrid[:280, :440]
            for _ in range(12):
                cx = rng.randint(0, 440)
                cy = rng.randint(0, 280)
                r  = rng.randint(10, 60)
                cr = rng.randint(80, 220)
                cg = rng.randint(80, 220)
                cb = rng.randint(80, 220)
                mask = ((xx - cx) ** 2 + (yy - cy) ** 2) <= r ** 2
                img_arr[mask] = [cr, cg, cb]
            return None, img_arr, "*图像资产预览（SeaweedFS Lance 向量数据）*", info, tree
        except Exception as e:
            return None, None, f"图像预览失败: {e}", info, tree

    elif preview_type == "文档预览":
        doc = f"""### 文档预览：`{table}`

| 属性 | 值 |
|---|---|
| 存储路径 | `seaweedfs://{catalog}/{schema}/{table}.pdf` |
| 文档格式 | PDF |
| 向量维度 | 768 |
| 生成时间 | 2026-02-25 09:00:00 |

#### 文档摘要
合同编号：CON-20260225001  
签订日期：2026年02月25日  
甲方：BONC 数据湖解决方案  
乙方：XX 科技有限公司  

*根据相关法律法规，甲乙双方就多模态数据湖建设项目达成如下协议…*
"""
        return None, None, doc, info, tree

    return None, None, "*未知预览类型*", info, tree


def load_jobs() -> pd.DataFrame:
    result = ray_client.list_jobs()
    jobs = result if (isinstance(result, list) and result) else MOCK_JOBS
    return _jobs_to_df(jobs)


def submit_ray_job(entrypoint: str, working_dir: str, pip_deps: str,
                   env_vars: str, num_cpus: float, num_gpus: float,
                   job_id_prefix: str, vectorize: bool, vector_config_str: str):
    if not entrypoint.strip():
        return "⚠️ 入口命令不能为空", load_jobs()

    final_entrypoint = entrypoint
    if vectorize:
        try:
            vc = json.loads(vector_config_str) if vector_config_str.strip() else {
                "model_name":   "bert-base-chinese",
                "input_path":   "seaweedfs://raw_data",
                "output_path":  "seaweedfs://vector_data",
                "num_workers":  int(num_cpus),
            }
            final_entrypoint = VectorizedJobWrapper().wrap_etl_job(entrypoint, vc)
        except Exception as e:
            return f"⚠️ 向量化封装失败: {e}", load_jobs()

    runtime_env: Dict = {}
    if working_dir.strip():
        runtime_env["working_dir"] = working_dir.strip()
    if pip_deps.strip():
        runtime_env["pip"] = [p.strip() for p in pip_deps.split(",") if p.strip()]
    if env_vars.strip():
        env_dict = {}
        for line in env_vars.splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                env_dict[k.strip()] = v.strip()
        if env_dict:
            runtime_env["env_vars"] = env_dict
    runtime_env["resources"] = {"CPU": num_cpus, "GPU": num_gpus}

    job_id = f"{job_id_prefix or 'job'}-{int(time.time())}"
    result = ray_client.submit_job(final_entrypoint, runtime_env, job_id)

    if "error" in result:
        MOCK_JOBS.insert(0, {
            "job_id":     job_id,
            "status":     "PENDING",
            "entrypoint": entrypoint,
            "start_time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "duration":   "-",
            "resources":  f"CPU:{int(num_cpus)}, GPU:{int(num_gpus)}",
            "type":       "Daft ETL + 向量化" if vectorize else "普通任务",
        })
        msg = f"✅ 任务已提交（Mock 模式）\n\n**任务ID**: `{job_id}`\n**入口**: `{entrypoint}`"
    else:
        msg = f"✅ 任务提交成功\n\n**任务ID**: `{result.get('job_id', job_id)}`"

    return msg, load_jobs()


def get_job_detail(job_id: str):
    if not job_id.strip():
        return "请输入任务ID", ""
    result = ray_client.get_job(job_id.strip())
    if "error" in result:
        mock = next((j for j in MOCK_JOBS if j["job_id"] == job_id.strip()), None)
        detail = "\n".join([f"**{k}**: {v}" for k, v in mock.items()]) if mock else f"未找到任务: {job_id}"
        logs = ray_client.job_logs(job_id.strip())
    else:
        detail = json.dumps(result, indent=2, ensure_ascii=False)
        logs = ray_client.job_logs(job_id.strip())
    return detail, logs


def refresh_jobs():
    return load_jobs()


def save_config(g_url: str, g_ml: str, r_url: str, s_url: str, d_url: str):
    """保存所有服务连接配置，并对 SeaweedFS Master 做可达性探测。"""
    global gravitino_client, ray_client, seaweed_client, doris_client
    import re

    # ── Gravitino ──
    clean_g = re.sub(r'/ui(/.*)?$', '', g_url.strip().rstrip('/'))
    gravitino_client = GravitinoClient(clean_g, g_ml)

    # ── Ray ──
    ray_client = RayClient(r_url.strip())

    # ── SeaweedFS Master ──
    clean_s = s_url.strip().rstrip('/')
    seaweed_client = SeaweedFSClient(clean_s)

    # ── Doris FE ──
    doris_client = DorisClient(d_url.strip())

    # ── SeaweedFS 可达性探测 ──
    seaweed_status = ""
    try:
        resp = requests.get(f"{clean_s}/dir/status", timeout=4)
        if resp.status_code == 200:
            seaweed_status = f"✅ SeaweedFS 已连接（{clean_s}）"
        else:
            seaweed_status = f"⚠️ SeaweedFS HTTP {resp.status_code}（{clean_s}）"
    except requests.exceptions.ConnectionError:
        seaweed_status = f"❌ SeaweedFS 网络不可达（{clean_s}）"
    except requests.exceptions.Timeout:
        seaweed_status = f"❌ SeaweedFS 连接超时（{clean_s}）"
    except Exception as e:
        seaweed_status = f"❌ SeaweedFS 异常: {e}"

    lines = [
        "### ✅ 配置已保存",
        f"- **Gravitino**: `{clean_g}`  |  Metalake: `{g_ml}`",
        f"- **Ray Dashboard**: `{r_url}`",
        f"- **SeaweedFS Master**: `{clean_s}`  →  {seaweed_status}",
        f"- **Doris FE**: `{d_url}`",
    ]
    return "\n\n".join(lines)


def upload_to_seaweedfs(file_obj, collection: str):
    """上传文件到 SeaweedFS（gr.File 返回 NamedString/tempfile 对象）"""
    if file_obj is None:
        return "⚠️ 请先选择文件"
    # Gradio 6.x gr.File 返回路径字符串或含 .name 的对象
    file_path = file_obj if isinstance(file_obj, str) else getattr(file_obj, "name", str(file_obj))
    try:
        fid = seaweed_client.upload_file(file_path, collection)
        return f"✅ 上传成功！\n\nSeaweedFS fid: `{fid}`\n存储位置: `seaweedfs://{collection}/{fid}`"
    except Exception as e:
        return f"❌ 上传失败: {e}"


def convert_to_lance(file_obj, file_type: str, output_path: str):
    """转换文件为 Lance 格式"""
    if file_obj is None:
        return "⚠️ 请先选择文件"
    file_path = file_obj if isinstance(file_obj, str) else getattr(file_obj, "name", str(file_obj))
    if file_type == "image":
        result = lance_converter.image_to_lance(file_path, output_path)
    elif file_type == "pdf":
        result = lance_converter.pdf_to_lance(file_path, output_path)
    else:
        return "⚠️ 不支持的文件类型"
    status = result.get("status", "?")
    dims   = result.get("dims", "?")
    note   = result.get("note", "")
    return (
        f"{'✅' if status == 'success' else '🔶'} Lance 转换{'成功' if status=='success' else '（Mock模式）'}\n\n"
        f"- 输出路径: `{result.get('output', output_path)}`\n"
        f"- 向量维度: **{dims}**\n"
        f"- 写入行数: {result.get('rows', 1)}\n"
        + (f"- 备注: {note}" if note else "")
    )


def connect_doris(host: str, port, user: str, password: str, db: str):
    global doris_client
    doris_client = DorisClient(host, int(port), user, password, db)
    ok = doris_client.connect()
    return "✅ Doris 连接成功！" if ok else "⚠️ 连接失败，将使用 Mock 模式演示"


def create_doris_external_table(table_name: str, seaweedfs_path: str, file_format: str):
    return doris_client.create_seaweedfs_external_table(table_name, seaweedfs_path, file_format)


def execute_doris_sql(sql: str):
    result = doris_client.execute_sql(sql)
    return json.dumps(result, indent=2, ensure_ascii=False, default=str)


def doris_vector_search(table_name: str, query_text: str, top_k):
    result = doris_client.vector_search(table_name, query_text, int(top_k))
    return json.dumps(result, indent=2, ensure_ascii=False, default=str)


def nl2sql_convert(natural_language: str):
    return doris_client.nl2sql(natural_language)


def nl2vector_convert(semantic_desc: str):
    return doris_client.nl2vector_search(semantic_desc)


def add_workflow_node(node_type: str, workflow_text: str):
    node_map = {
        "读取Lance数据": "📥 读取 SeaweedFS Lance 数据",
        "向量化处理":   "🔢 文本 / 图像向量化（CLIP/BERT）",
        "GPU推理":      "⚡ GPU 分布式推理",
        "写入Doris":    "📤 写入 Doris 联邦表",
        "Daft ETL":     "🔄 Daft ETL 数据转换",
    }
    nodes = workflow_text.splitlines() if workflow_text.strip() else []
    nodes.append(node_map.get(node_type, f"📝 {node_type}"))
    return "\n".join(nodes)


def clear_workflow(_):
    return ""


# ─────────────────────────────────────────────
#  构建 Gradio UI
# ─────────────────────────────────────────────
def build_ui():
    _theme = gr.themes.Base(
        primary_hue=gr.themes.colors.blue,
        secondary_hue=gr.themes.colors.indigo,
        neutral_hue=gr.themes.colors.slate,
        font=gr.themes.GoogleFont("Inter"),
    ).set(
        body_background_fill="#f5f7fa",
        block_background_fill="#ffffff",
        block_border_color="#e2e8f0",
        block_label_text_color="#0066ff",
        input_background_fill="#f8fafc",
        input_border_color="#e2e8f0",
        button_primary_background_fill="linear-gradient(135deg,#0066ff,#2563eb)",
        button_primary_text_color="#ffffff",
        button_secondary_background_fill="#f8fafc",
        button_secondary_text_color="#0066ff",
        button_secondary_border_color="#e2e8f0",
    )

    with gr.Blocks(title="多模态数据湖统一管理平台") as demo:

        # ── Header ──
        gr.HTML("""
        <div class="main-header">
          <div style="display:flex;align-items:center;gap:16px;">
            <div class="bonc-logo">BONC</div>
            <div>
              <h1>多模态数据湖统一管理平台</h1>
              <p>BONC · Apache Gravitino · Ray AI Platform · SeaweedFS · Lance · Doris</p>
            </div>
            <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;">
              <span class="badge badge-blue">BONC 数据湖解决方案</span>
              <span class="badge badge-green">Ray 2.x</span>
              <span class="badge badge-orange">Lance 格式</span>
            </div>
          </div>
        </div>
        """)

        with gr.Tabs():

            # ════════════════════════════════════
            #  TAB 1: 资产浏览器
            # ════════════════════════════════════
            with gr.Tab("🗂 资产浏览器"):
                with gr.Row():
                    g_url_in = gr.Textbox(value="http://localhost:8090",
                                          label="Gravitino 服务地址（支持 http://host:port 或完整 UI 地址）",
                                          scale=3)
                    g_ml_in  = gr.Textbox(value="demo_lake", label="Metalake 名称", scale=1)
                    g_conn   = gr.Button("🔌 连接", variant="primary", scale=1)
                    g_diag   = gr.Button("🔍 诊断", variant="secondary", scale=1)
                g_status = gr.HTML(
                    '<div class="status-bar"><span class="status-item">'
                    '<span class="status-dot dot-gray"></span>未连接 — 使用 Mock 数据</span></div>'
                )
                g_diag_out = gr.Markdown("", visible=False)

                with gr.Row():
                    # ── 左栏 ──
                    with gr.Column(scale=1, min_width=260):
                        gr.Markdown("### 📦 数据目录")
                        cat_dd  = gr.Dropdown(choices=MOCK_CATALOGS, value=MOCK_CATALOGS[0],
                                              label="Catalog", interactive=True)
                        sch_dd  = gr.Dropdown(choices=MOCK_SCHEMAS[MOCK_CATALOGS[0]],
                                              value=MOCK_SCHEMAS[MOCK_CATALOGS[0]][0],
                                              label="Schema", interactive=True)
                        tbl_dd  = gr.Dropdown(
                            choices=MOCK_TABLES.get(MOCK_SCHEMAS[MOCK_CATALOGS[0]][0], []),
                            value=MOCK_TABLES.get(MOCK_SCHEMAS[MOCK_CATALOGS[0]][0], [""])[0],
                            label="Table / 资产", interactive=True)
                        prev_type = gr.Radio(
                            ["数据预览", "Schema 信息", "图像预览", "文档预览"],
                            value="数据预览", label="预览类型")
                        prev_btn = gr.Button("👁 预览资产", variant="primary")

                        gr.Markdown("---")
                        gr.Markdown("### 📤 SeaweedFS 上传")
                        upload_file = gr.File(label="选择文件",
                                              file_types=[".jpg", ".jpeg", ".png", ".pdf"])
                        upload_col  = gr.Textbox(value="multimodal", label="Collection")
                        upload_btn  = gr.Button("📤 上传", variant="secondary")
                        upload_res  = gr.Markdown("")

                        gr.Markdown("---")
                        gr.Markdown("### 🔢 Lance 格式转换")
                        conv_file = gr.File(label="选择文件",
                                            file_types=[".jpg", ".jpeg", ".png", ".pdf"])
                        conv_type = gr.Radio(["image", "pdf"], value="image", label="文件类型")
                        conv_out  = gr.Textbox(value="./output_lance", label="输出路径")
                        conv_btn  = gr.Button("🔄 转为 Lance", variant="secondary")
                        conv_res  = gr.Markdown("")

                        gr.Markdown("---")
                        gr.Markdown("**资产树**")
                        asset_tree = gr.HTML(_build_asset_tree(
                            MOCK_CATALOGS[0],
                            MOCK_SCHEMAS[MOCK_CATALOGS[0]][0],
                            MOCK_TABLES.get(MOCK_SCHEMAS[MOCK_CATALOGS[0]][0], [""])[0]))

                    # ── 右栏 ──
                    with gr.Column(scale=3):
                        gr.Markdown("### 👁 资产预览")
                        prev_info = gr.HTML(
                            '<div style="color:#94a3b8;font-size:13px;padding:8px;">选择左侧资产并点击预览</div>')
                        with gr.Tabs():
                            with gr.Tab("📊 表格 / Schema"):
                                prev_df = gr.Dataframe(interactive=False, wrap=True)
                            with gr.Tab("🖼 图像"):
                                prev_img = gr.Image(type="pil", interactive=False, height=360)
                            with gr.Tab("📄 文档"):
                                prev_doc = gr.Markdown("*等待加载...*")

                # 事件
                g_conn.click(connect_gravitino, [g_url_in, g_ml_in], [g_status, cat_dd])
                g_diag.click(diagnose_gravitino, [g_url_in, g_ml_in], [g_diag_out])
                cat_dd.change(load_schemas,           [cat_dd],          [sch_dd])
                sch_dd.change(load_tables,            [cat_dd, sch_dd],  [tbl_dd])
                prev_btn.click(preview_asset,
                               [cat_dd, sch_dd, tbl_dd, prev_type],
                               [prev_df, prev_img, prev_doc, prev_info, asset_tree])
                tbl_dd.change(lambda c, s, t: _build_asset_tree(c, s, t),
                              [cat_dd, sch_dd, tbl_dd], [asset_tree])
                upload_btn.click(upload_to_seaweedfs, [upload_file, upload_col], [upload_res])
                conv_btn.click(convert_to_lance,      [conv_file, conv_type, conv_out], [conv_res])

            # ════════════════════════════════════
            #  TAB 2: AI 工作台
            # ════════════════════════════════════
            with gr.Tab("🤖 AI 工作台"):
                with gr.Row():
                    ray_url_in  = gr.Textbox(value="http://localhost:8265",
                                             label="Ray Dashboard 地址", scale=3)
                    ray_conn    = gr.Button("🔌 连接集群", variant="primary", scale=1)
                ray_status = gr.HTML(
                    '<div class="status-bar"><span class="status-item">'
                    '<span class="status-dot dot-gray"></span>未连接 — 使用 Mock 数据</span></div>'
                )

                gr.Markdown("### ⚡ 集群资源")
                cluster_html = gr.HTML(_mock_cluster_info())

                gr.Markdown("---")
                gr.Markdown("### 📋 工作流编排")
                with gr.Row():
                    with gr.Column(scale=1):
                        node_type_dd = gr.Dropdown(
                            choices=["读取Lance数据", "向量化处理", "GPU推理", "写入Doris", "Daft ETL"],
                            value="读取Lance数据", label="选择节点类型")
                        add_node_btn   = gr.Button("➕ 添加节点", variant="secondary")
                        clear_node_btn = gr.Button("🗑 清空工作流", variant="secondary")
                    with gr.Column(scale=3):
                        workflow_txt = gr.Textbox(
                            label="工作流节点（按顺序排列）",
                            placeholder="📥 读取 SeaweedFS Lance 数据\n🔢 向量化处理\n⚡ GPU 推理\n📤 写入 Doris",
                            lines=6)

                gr.Markdown("---")
                with gr.Row():
                    # ── 提交任务 ──
                    with gr.Column(scale=1):
                        gr.Markdown("### 🚀 提交 Ray 任务")
                        job_ep   = gr.Textbox(
                            value="python etl_daft.py --input lance://seaweedfs/image_vectors",
                            label="入口命令 *", lines=2)
                        job_wd   = gr.Textbox(label="Working Dir", placeholder="s3://bucket/jobs/")
                        job_pip  = gr.Textbox(label="Pip 依赖（逗号分隔）",
                                              placeholder="torch, transformers, daft, lance")
                        job_env  = gr.Textbox(label="环境变量（KEY=VALUE 每行）", lines=3,
                                              elem_classes=["code-area"])
                        with gr.Row():
                            job_cpu = gr.Slider(0, 32, value=4, step=1, label="CPU 核心数")
                            job_gpu = gr.Slider(0, 8,  value=0, step=1, label="GPU 数量")
                        job_pfx  = gr.Textbox(value="job", label="任务 ID 前缀")
                        vectorize_cb = gr.Checkbox(label="🔢 启用自动向量化封装", value=False)
                        vec_cfg  = gr.Textbox(
                            value='{"model_name":"bert-base-chinese","input_path":"seaweedfs://raw","output_path":"seaweedfs://vectors","num_workers":4}',
                            label="向量化配置 JSON", lines=3, elem_classes=["code-area"])
                        submit_btn = gr.Button("🚀 提交任务", variant="primary")
                        submit_res = gr.Markdown("")

                    # ── 任务监控 ──
                    with gr.Column(scale=2):
                        gr.Markdown("### 📊 任务监控")
                        with gr.Row():
                            refresh_btn = gr.Button("🔄 刷新", variant="secondary")
                        jobs_df = gr.Dataframe(value=load_jobs(), interactive=False, wrap=False)

                        gr.Markdown("### 🔍 任务详情")
                        with gr.Row():
                            detail_id  = gr.Textbox(label="任务 ID", placeholder="job-001", scale=3)
                            detail_btn = gr.Button("🔍 查询", variant="secondary", scale=1)
                        with gr.Tabs():
                            with gr.Tab("📋 详情"):
                                job_detail = gr.Markdown("*等待查询...*")
                            with gr.Tab("📜 日志"):
                                job_log = gr.Code(language=None, lines=10, interactive=False,
                                                  elem_classes=["code-area"])

                # 事件
                ray_conn.click(connect_ray, [ray_url_in], [ray_status, cluster_html])
                submit_btn.click(submit_ray_job,
                                 [job_ep, job_wd, job_pip, job_env,
                                  job_cpu, job_gpu, job_pfx, vectorize_cb, vec_cfg],
                                 [submit_res, jobs_df])
                refresh_btn.click(refresh_jobs, outputs=[jobs_df])
                detail_btn.click(get_job_detail, [detail_id], [job_detail, job_log])
                add_node_btn.click(add_workflow_node, [node_type_dd, workflow_txt], [workflow_txt])
                clear_node_btn.click(clear_workflow, [workflow_txt], [workflow_txt])

            # ════════════════════════════════════
            #  TAB 3: Doris 联邦查询
            # ════════════════════════════════════
            with gr.Tab("📊 Doris 联邦查询"):
                gr.Markdown("### 🔌 Doris 连接配置")
                with gr.Row():
                    d_host = gr.Textbox(value="localhost", label="FE 主机", scale=2)
                    d_port = gr.Number(value=9030, label="端口", precision=0, scale=1)
                    d_user = gr.Textbox(value="root",    label="用户名", scale=1)
                    d_pwd  = gr.Textbox(value="",        label="密码", type="password", scale=1)
                    d_db   = gr.Textbox(value="default", label="数据库", scale=1)
                    d_conn = gr.Button("🔌 连接", variant="primary", scale=1)
                d_conn_res = gr.Markdown("")

                gr.Markdown("---")
                gr.Markdown("### 📦 SeaweedFS 外表管理")
                with gr.Row():
                    ext_name   = gr.Textbox(value="lance_vector_table", label="外表名称", scale=2)
                    ext_path   = gr.Textbox(value="seaweedfs://multimodal", label="SeaweedFS 路径", scale=2)
                    ext_fmt    = gr.Dropdown(["lance", "parquet", "json"],
                                             value="lance", label="文件格式", scale=1)
                    create_btn = gr.Button("📝 创建外表", variant="secondary", scale=1)
                create_res = gr.Markdown("")

                gr.Markdown("---")
                gr.Markdown("### 📝 SQL 编辑器")
                doris_sql = gr.Code(value="SELECT * FROM lance_vector_table LIMIT 10;",
                                    language="sql", lines=7, elem_classes=["code-area"])
                with gr.Row():
                    exec_btn  = gr.Button("▶️ 执行 SQL", variant="primary")
                    clear_btn = gr.Button("🗑 清空",     variant="secondary")
                sql_res = gr.Code(language="json", lines=8, interactive=False,
                                  elem_classes=["code-area"])

                gr.Markdown("---")
                gr.Markdown("### 🔍 向量检索")
                with gr.Row():
                    v_table = gr.Textbox(value="lance_vector_table", label="检索表", scale=2)
                    v_query = gr.Textbox(value="红色背景的用户头像图片", label="语义查询", scale=3)
                    v_topk  = gr.Number(value=5, label="Top K", precision=0, minimum=1,
                                        maximum=20, scale=1)
                    v_btn   = gr.Button("🔍 向量检索", variant="primary", scale=1)
                v_res = gr.Code(language="json", lines=7, interactive=False,
                                elem_classes=["code-area"])

                gr.Markdown("---")
                gr.Markdown("### 🗣 自然语言转换（MCP SQL/Vector Tool）")
                with gr.Row():
                    with gr.Column():
                        gr.Markdown("#### 📊 自然语言 → SQL")
                        nl_in  = gr.Textbox(value="查询所有图片向量数据", label="自然语言", lines=2)
                        nl_btn = gr.Button("🔄 转换为 SQL", variant="secondary")
                        nl_out = gr.Code(language="sql", lines=5, interactive=False,
                                         elem_classes=["code-area"])
                    with gr.Column():
                        gr.Markdown("#### 🔢 语义描述 → 向量检索")
                        vl_in  = gr.Textbox(value="提取PDF文档中关于用户行为的内容",
                                            label="语义描述", lines=2)
                        vl_btn = gr.Button("🔄 转换为检索指令", variant="secondary")
                        vl_out = gr.Code(language="sql", lines=5, interactive=False,
                                         elem_classes=["code-area"])

                # 事件
                d_conn.click(connect_doris,    [d_host, d_port, d_user, d_pwd, d_db], [d_conn_res])
                create_btn.click(create_doris_external_table, [ext_name, ext_path, ext_fmt], [create_res])
                exec_btn.click(execute_doris_sql,  [doris_sql], [sql_res])
                clear_btn.click(lambda: "",        outputs=[doris_sql])
                v_btn.click(doris_vector_search,   [v_table, v_query, v_topk], [v_res])
                nl_btn.click(nl2sql_convert,       [nl_in],  [nl_out])
                vl_btn.click(nl2vector_convert,    [vl_in],  [vl_out])

            # ════════════════════════════════════
            #  TAB 4: 系统配置
            # ════════════════════════════════════
            with gr.Tab("⚙️ 系统配置"):
                gr.Markdown("### 服务连接配置")
                with gr.Row():
                    cfg_g_url = gr.Textbox(value="http://localhost:8090", label="Gravitino 地址")
                    cfg_g_ml  = gr.Textbox(value="demo_lake",             label="Metalake")
                with gr.Row():
                    cfg_r_url = gr.Textbox(value="http://localhost:8265", label="Ray Dashboard 地址")
                    cfg_s_url = gr.Textbox(value="http://localhost:9333", label="SeaweedFS Master")
                    cfg_d_url = gr.Textbox(value="localhost:9030",        label="Doris FE")
                save_btn  = gr.Button("💾 保存配置", variant="primary")
                cfg_res   = gr.Markdown("")
                save_btn.click(
                    save_config,
                    [cfg_g_url, cfg_g_ml, cfg_r_url, cfg_s_url, cfg_d_url],
                    [cfg_res],
                )

                gr.Markdown("---")
                gr.Markdown("""
### 📖 使用说明

#### 资产浏览器
1. 填写 Gravitino 地址并点击 **连接**（未部署自动使用 Mock 数据）
2. 依次选择 **Catalog → Schema → Table**，选择预览类型后点击 **预览资产**
3. 支持将图片/PDF **上传到 SeaweedFS** 并 **一键转为 Lance 向量格式**

#### AI 工作台
1. 连接 Ray 集群，查看 CPU/GPU/内存资源状态
2. 可视化编排工作流节点，生成 Daft ETL 流程
3. 填写任务参数，开启 **自动向量化封装** 后提交任务
4. 在监控面板查看任务状态，支持查看详情和日志

#### Doris 联邦查询
1. 配置 Doris FE 连接信息并测试
2. 可视化创建 SeaweedFS Lance 格式外表
3. SQL 编辑器支持语法高亮，结果 JSON 格式化展示
4. 向量检索支持语义查询，自然语言工具支持 NL→SQL / NL→向量检索

#### 系统架构
```
BONC 多模态数据湖统一管理平台
├── GravitinoClient   → 多模态资产元数据管理
├── SeaweedFSClient   → 非结构化数据分布式存储
├── LanceConverter    → 图片/PDF → Lance 向量化
├── RayClient         → 分布式计算调度 + 零拷贝读取
├── DorisClient       → 联邦查询 + 向量检索 + NL2SQL
└── VectorizedJobWrapper → Daft ETL 自动向量化封装
```

> 所有模块均支持 Mock 模式，无需部署真实服务即可体验全部功能。
                """)

    return demo, _theme


# ─────────────────────────────────────────────
#  入口
# ─────────────────────────────────────────────
if __name__ == "__main__":
    app, theme = build_ui()
    app.launch(
        server_name="127.0.0.1",
        server_port=7860,
        show_error=True,
        share=False,
        theme=theme,
        css=CUSTOM_CSS,
    )
