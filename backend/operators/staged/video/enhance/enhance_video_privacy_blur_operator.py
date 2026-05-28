import json
import os
import re
import shutil
import subprocess
import tempfile
import base64
import urllib.request
import urllib.error
import time
from collections import deque

import cv2
import numpy as np


def _linear_sum_assignment(cost_matrix):
    """纯 Python 匈牙利算法（最小化），替代 scipy.optimize.linear_sum_assignment。"""
    n_rows = len(cost_matrix)
    n_cols = len(cost_matrix[0]) if n_rows else 0
    if n_rows == 0 or n_cols == 0:
        return [], []
    size = max(n_rows, n_cols)
    big = sum(abs(c) for row in cost_matrix for c in row) + 1.0
    C = [[big] * size for _ in range(size)]
    for i in range(n_rows):
        for j in range(n_cols):
            C[i][j] = float(cost_matrix[i][j])
    INF = float('inf')
    u = [0.0] * (size + 1)
    v = [0.0] * (size + 1)
    p = [0] * (size + 1)
    way = [0] * (size + 1)
    for i in range(1, size + 1):
        p[0] = i
        j0 = 0
        minval = [INF] * (size + 1)
        used = [False] * (size + 1)
        while True:
            used[j0] = True
            i0 = p[j0]
            delta = INF
            j1 = -1
            for j in range(1, size + 1):
                if not used[j]:
                    cur = C[i0 - 1][j - 1] - u[i0] - v[j]
                    if cur < minval[j]:
                        minval[j] = cur
                        way[j] = j0
                    if minval[j] < delta:
                        delta = minval[j]
                        j1 = j
            for j in range(size + 1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minval[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while j0:
            p[j0] = p[way[j0]]
            j0 = way[j0]
    row_ind, col_ind = [], []
    for j in range(1, size + 1):
        if 1 <= p[j] <= n_rows and j <= n_cols:
            row_ind.append(p[j] - 1)
            col_ind.append(j - 1)
    return row_ind, col_ind

from clientApp.operator.operators.operator_abs import OperatorAbs
from clientApp.utils.enum.format_enum import FileFormatType
from clientApp.utils.file_info_util import process_file_info
from clientApp.utils.file_utils import is_dir_empty, is_directory_exists


"""
V4003 视频隐私信息模糊算子
"""


class _KalmanBox:
    """单个文字框的 Kalman 滤波器，状态 [cx,cy,w,h,vx,vy,vw,vh]。"""
    _F = np.array([
        [1,0,0,0,1,0,0,0],
        [0,1,0,0,0,1,0,0],
        [0,0,1,0,0,0,1,0],
        [0,0,0,1,0,0,0,1],
        [0,0,0,0,1,0,0,0],
        [0,0,0,0,0,1,0,0],
        [0,0,0,0,0,0,1,0],
        [0,0,0,0,0,0,0,1],
    ], dtype=float)
    _H = np.eye(4, 8, dtype=float)
    _Q = np.diag([1,1,1,1,0.01,0.01,0.0001,0.0001]).astype(float)
    _R = np.diag([1,1,10,10]).astype(float)
    _P0 = np.diag([10,10,10,10,1e4,1e4,1e4,1e4]).astype(float)

    def __init__(self, box):
        cx, cy, w, h = self._box_to_state(box)
        self.x = np.array([cx, cy, w, h, 0, 0, 0, 0], dtype=float)
        self.P = self._P0.copy()

    @staticmethod
    def _box_to_state(box):
        x1, y1, x2, y2 = box
        return (x1+x2)/2, (y1+y2)/2, x2-x1, y2-y1

    @staticmethod
    def _state_to_box(x):
        cx, cy, w, h = x[0], x[1], x[2], x[3]
        return (cx - w/2, cy - h/2, cx + w/2, cy + h/2)

    def predict(self):
        self.x = self._F @ self.x
        self.P = self._F @ self.P @ self._F.T + self._Q
        return self._state_to_box(self.x)

    def update(self, box):
        z = np.array(self._box_to_state(box), dtype=float)
        S = self._H @ self.P @ self._H.T + self._R
        K = self.P @ self._H.T @ np.linalg.inv(S)
        self.x = self.x + K @ (z - self._H @ self.x)
        self.P = (np.eye(8) - K @ self._H) @ self.P
        return self._state_to_box(self.x)

    def get_box(self):
        return self._state_to_box(self.x)


class _PrivacyTracker:
    """轻量 IoU+Kalman 文字框追踪器，不依赖外部追踪库。"""

    def __init__(self, max_age=16, iou_thresh=0.3):
        self.max_age = max_age
        self.iou_thresh = iou_thresh
        self._next_id = 1
        self._tracks = {}  # track_id -> {"kf": _KalmanBox, "age": int, "hits": int}

    @staticmethod
    def _iou(a, b):
        ax1, ay1, ax2, ay2 = a
        bx1, by1, bx2, by2 = b
        ix1, iy1 = max(ax1, bx1), max(ay1, by1)
        ix2, iy2 = min(ax2, bx2), min(ay2, by2)
        inter = max(0, ix2-ix1) * max(0, iy2-iy1)
        if inter == 0:
            return 0.0
        ua = (ax2-ax1)*(ay2-ay1) + (bx2-bx1)*(by2-by1) - inter
        return inter / max(ua, 1e-6)

    def update(self, detections):
        """
        detections: list of (x1,y1,x2,y2)
        返回: list of {"track_id": int, "box": (x1,y1,x2,y2), "is_new": bool}
        """
        # 预测所有 track
        pred_boxes = {tid: t["kf"].predict() for tid, t in self._tracks.items()}
        track_ids = list(pred_boxes.keys())

        results = []
        matched_tids = set()
        matched_dets = set()

        if track_ids and detections:
            cost = np.zeros((len(track_ids), len(detections)))
            for i, tid in enumerate(track_ids):
                for j, det in enumerate(detections):
                    cost[i, j] = 1 - self._iou(pred_boxes[tid], det)
            row_ind, col_ind = _linear_sum_assignment(cost.tolist())
            for r, c in zip(row_ind, col_ind):
                if cost[r, c] < 1 - self.iou_thresh:
                    tid = track_ids[r]
                    self._tracks[tid]["kf"].update(detections[c])
                    self._tracks[tid]["age"] = 0
                    self._tracks[tid]["hits"] += 1
                    matched_tids.add(tid)
                    matched_dets.add(c)

        # 新 detection → 新 track
        new_tids = set()
        for j, det in enumerate(detections):
            if j not in matched_dets:
                tid = self._next_id
                self._next_id += 1
                self._tracks[tid] = {"kf": _KalmanBox(det), "age": 0, "hits": 1}
                new_tids.add(tid)

        # 未匹配 track 老化
        dead = []
        for tid in list(self._tracks.keys()):
            if tid not in matched_tids and tid not in new_tids:
                self._tracks[tid]["age"] += 1
                if self._tracks[tid]["age"] > self.max_age:
                    dead.append(tid)
        for tid in dead:
            del self._tracks[tid]

        # 输出所有活跃 track
        for tid, t in self._tracks.items():
            box = t["kf"].get_box()
            box = (int(box[0]), int(box[1]), int(box[2]), int(box[3]))
            results.append({"track_id": tid, "box": box, "is_new": tid in new_tids})

        return results

    def remove(self, track_id):
        self._tracks.pop(track_id, None)


class EnhanceVideoPrivacyBlurOperator(OperatorAbs):
    REMOTE_OCR_SERVICE_URL = "http://137.4.5.110:6663/ocr/single"
    REMOTE_OCR_BATCH_SERVICE_URL = "http://137.4.5.110:6663/ocr/batch"
    UNSUPPORTED_VIDEO_EXTENSIONS = (".ts", ".m4v")
    # 内置英文敏感列名/SQL 模式（小写），OCR 文本中出现即整框打码
    _BUILTIN_SENSITIVE_PATTERNS = {
        "custidentitycode", "identitycode", "identity_code",
        "serviceid", "service_id",
        "phonenumber", "phone_number", "phoneno", "phone_no",
        "mobileno", "mobile_no", "mobilephone",
        "idcard", "id_card", "idcardno", "id_card_no",
        "bankcard", "bank_card", "bankcardno",
        "certno", "cert_no", "certcode",
        "acctno", "acct_no", "accountno", "account_no",
        "passwd", "password",
        "ssn", "socialid",
    }
    DEFAULT_PARAMS = {
        "min_ocr_score": 0.45,
        "blur_ratio": 0.55,
        "min_blur_kernel": 7,
        "max_blur_kernel": 151,
        "box_expand_ratio": 0.04,
        "merge_line_y_ratio": 0.60,
        "merge_line_gap_ratio": 0.25,
        "max_box_area_ratio": 0.22,
        "max_box_height_ratio": 0.22,
        "max_box_width_ratio": 0.92,
        "min_sensitive_span_ratio": 0.08,
        "ocr_max_width": 0,
        "keywords": [],
        "enable_phone": True,
        "enable_email": True,
        "enable_id_card": True,
        "enable_bank_card": False,
        "enable_ip": True,
        "ocr_lang": "ch",
        "keep_audio": True,
        "emit_report": True,
        "keyword_value_lookahead_chars": 48,
        "report_max_entries": 1000,
        "ocr_mode": "remote",
        "ocr_service_url": REMOTE_OCR_SERVICE_URL,
        "ocr_batch_service_url": REMOTE_OCR_BATCH_SERVICE_URL,
        "ocr_service_timeout_sec": 30,
        "ocr_batch_size": 8,
        "batch_ocr_wait_buffer": 16,
        "periodic_ocr_interval_sec": 1.0,
        "region_recheck_interval_sec": 4.0,
        "future_backfill_window_sec": 3.0,
        "future_backfill_max_new_boxes": 12,
        "startup_force_ocr_duration_sec": 3.0,
        "startup_force_ocr_interval_frames": 4,
        "retry_ocr_interval_frames_no_detection": 6,
        "max_duration_sec": 0,
        "tracker_max_age_sec": 8.0,
        "tracker_iou_thresh": 0.3,
        "tracking_downscale": 0.5,
        "tracking_max_global_shift": 96,
        "tracking_search_radius": 48,
        "tracking_min_template_score": 0.45,
        "tracking_smooth_alpha": 0.65,
        "tracking_scene_change_threshold": 6.0,
        "tracking_region_change_threshold": 4.5,
        "tracking_stable_bonus_max_sec": 20.0,
        "tracking_region_grace_max_sec": 16.0,
        "tracking_decay_on_scene_change": 2,
    }

    VIDEO_EXTENSIONS = FileFormatType.video.value

    def __init__(self):
        self.last_run_stats = {}

    def process(self, operator_id, source_path, sink_path, param, logger, config_dict):
        res_data = []
        if not is_directory_exists(source_path) or is_dir_empty(source_path):
            logger.warning(f"视频隐私模糊算子输入目录不存在或为空: {source_path}")
            return res_data

        os.makedirs(sink_path, exist_ok=True)
        params = self._parse_params(param, logger)
        processable_file_count = 0
        success_file_count = 0

        for file_name in os.listdir(source_path):
            file_path = os.path.join(source_path, file_name)
            write_path = os.path.join(sink_path, file_name)
            try:
                if not os.path.isfile(file_path):
                    logger.info(f"跳过非文件输入: {file_path}")
                    continue

                if self._is_video_file(file_name):
                    processable_file_count += 1
                    result = self._process_video_file(file_path, write_path, params, logger)
                    if result == 0:
                        success_file_count += 1
                    res_data.append(process_file_info(operator_id, file_path, write_path, result))
                elif self._is_known_unsupported_video_file(file_name):
                    processable_file_count += 1
                    logger.warning(f"视频隐私模糊算子暂不支持该视频格式，按处理失败记录: {file_name}")
                    res_data.append(process_file_info(operator_id, file_path, write_path, 1))
                else:
                    logger.info(f"跳过非视频文件: {file_name}")
                    res_data.append(process_file_info(operator_id, file_path, write_path, 2))
            except Exception as exc:
                logger.error(f"视频隐私模糊处理失败: {file_name}, error={exc}", exc_info=True)
                if os.path.exists(write_path):
                    try:
                        os.remove(write_path)
                    except OSError:
                        pass
                res_data.append(process_file_info(operator_id, file_path, write_path, 1))

        if processable_file_count > 0 and success_file_count == 0:
            raise RuntimeError("视频隐私模糊算子所有可处理文件均失败，任务应判定为失败")

        return res_data

    def _parse_params(self, param, logger):
        params = dict(self.DEFAULT_PARAMS)
        raw_params = {}

        if isinstance(param, dict):
            raw_params = param
        elif isinstance(param, str) and param.strip():
            try:
                raw_params = json.loads(param)
            except json.JSONDecodeError as exc:
                logger.warning(f"视频隐私模糊算子参数解析失败，使用默认配置: {exc}")

        if not isinstance(raw_params, dict):
            raw_params = {}

        params.update(raw_params)
        params["min_ocr_score"] = float(params.get("min_ocr_score", 0.45))
        params["blur_ratio"] = max(0.10, float(params.get("blur_ratio", 0.55)))
        params["min_blur_kernel"] = max(3, int(params.get("min_blur_kernel", 7)))
        params["max_blur_kernel"] = max(params["min_blur_kernel"], int(params.get("max_blur_kernel", 151)))
        params["box_expand_ratio"] = max(0.0, float(params.get("box_expand_ratio", 0.04)))
        params["merge_line_y_ratio"] = max(0.1, float(params.get("merge_line_y_ratio", 0.60)))
        params["merge_line_gap_ratio"] = max(0.1, float(params.get("merge_line_gap_ratio", 0.25)))
        params["max_box_area_ratio"] = max(0.01, float(params.get("max_box_area_ratio", 0.22)))
        params["max_box_height_ratio"] = max(0.01, float(params.get("max_box_height_ratio", 0.22)))
        params["max_box_width_ratio"] = max(0.05, float(params.get("max_box_width_ratio", 0.92)))
        params["min_sensitive_span_ratio"] = max(0.01, float(params.get("min_sensitive_span_ratio", 0.08)))
        params["ocr_max_width"] = int(params.get("ocr_max_width", 0))
        if params["ocr_max_width"] < 0:
            params["ocr_max_width"] = 0
        params["enable_phone"] = self._to_bool(params.get("enable_phone", True))
        params["enable_email"] = self._to_bool(params.get("enable_email", True))
        params["enable_id_card"] = self._to_bool(params.get("enable_id_card", True))
        params["enable_bank_card"] = self._to_bool(params.get("enable_bank_card", False))
        params["enable_ip"] = self._to_bool(params.get("enable_ip", True))
        params["keep_audio"] = self._to_bool(params.get("keep_audio", True))
        params["emit_report"] = self._to_bool(params.get("emit_report", True))
        params["keyword_value_lookahead_chars"] = max(8, int(params.get("keyword_value_lookahead_chars", 48)))
        params["report_max_entries"] = max(50, int(params.get("report_max_entries", 1000)))
        params["ocr_mode"] = "remote"
        params["ocr_service_url"] = str(params.get("ocr_service_url", self.REMOTE_OCR_SERVICE_URL)).strip() or self.REMOTE_OCR_SERVICE_URL
        batch_service_url = str(
            params.get("ocr_batch_service_url", self.REMOTE_OCR_BATCH_SERVICE_URL)
        ).strip()
        if not batch_service_url or batch_service_url == self.REMOTE_OCR_BATCH_SERVICE_URL:
            batch_service_url = params["ocr_service_url"].rstrip("/")
            if batch_service_url.endswith("/ocr/single"):
                batch_service_url = batch_service_url[:-len("/ocr/single")] + "/ocr/batch"
        params["ocr_batch_service_url"] = batch_service_url or self.REMOTE_OCR_BATCH_SERVICE_URL
        params["ocr_service_timeout_sec"] = max(3, int(params.get("ocr_service_timeout_sec", 30)))
        params["ocr_batch_size"] = max(1, int(params.get("ocr_batch_size", 8)))
        params["batch_ocr_wait_buffer"] = max(
            params["ocr_batch_size"],
            int(params.get("batch_ocr_wait_buffer", max(params["ocr_batch_size"] * 2, 16)))
        )
        params["periodic_ocr_interval_sec"] = max(0.1, float(params.get("periodic_ocr_interval_sec", 1.0)))
        params["region_recheck_interval_sec"] = max(
            params["periodic_ocr_interval_sec"],
            float(params.get("region_recheck_interval_sec", 4.0))
        )
        params["future_backfill_window_sec"] = max(0.0, float(params.get("future_backfill_window_sec", 3.0)))
        params["future_backfill_max_new_boxes"] = max(1, int(params.get("future_backfill_max_new_boxes", 12)))
        params["startup_force_ocr_duration_sec"] = max(0.0, float(params.get("startup_force_ocr_duration_sec", 3.0)))
        params["startup_force_ocr_interval_frames"] = max(1, int(params.get("startup_force_ocr_interval_frames", 4)))
        params["retry_ocr_interval_frames_no_detection"] = max(1, int(params.get("retry_ocr_interval_frames_no_detection", 6)))
        params["max_duration_sec"] = max(0, int(params.get("max_duration_sec", 0)))
        params["tracker_max_age_sec"] = max(0.5, float(params.get("tracker_max_age_sec", 8.0)))
        params["tracker_iou_thresh"] = max(0.1, min(0.9, float(params.get("tracker_iou_thresh", 0.3))))
        params["tracking_downscale"] = min(1.0, max(0.1, float(params.get("tracking_downscale", 0.5))))
        params["tracking_max_global_shift"] = max(4, int(params.get("tracking_max_global_shift", 96)))
        params["tracking_search_radius"] = max(8, int(params.get("tracking_search_radius", 48)))
        params["tracking_min_template_score"] = max(0.05, min(0.99, float(params.get("tracking_min_template_score", 0.45))))
        params["tracking_smooth_alpha"] = max(0.0, min(1.0, float(params.get("tracking_smooth_alpha", 0.65))))
        params["tracking_scene_change_threshold"] = max(0.5, float(params.get("tracking_scene_change_threshold", 6.0)))
        params["tracking_region_change_threshold"] = max(0.5, float(params.get("tracking_region_change_threshold", 4.5)))
        params["tracking_stable_bonus_max_sec"] = max(0.0, float(params.get("tracking_stable_bonus_max_sec", 20.0)))
        params["tracking_region_grace_max_sec"] = max(
            params["tracker_max_age_sec"],
            float(params.get("tracking_region_grace_max_sec", 16.0))
        )
        params["tracking_decay_on_scene_change"] = max(1, int(params.get("tracking_decay_on_scene_change", 2)))

        keywords = params.get("keywords", [])
        if isinstance(keywords, str):
            keywords = [item.strip() for item in re.split(r"[,，\n\r\t]+", keywords) if item.strip()]
        elif isinstance(keywords, (tuple, set)):
            keywords = [str(item).strip() for item in keywords if str(item).strip()]
        elif isinstance(keywords, list):
            keywords = [str(item).strip() for item in keywords if str(item).strip()]
        else:
            keywords = []
        params["keywords"] = keywords

        logger.info(f"视频隐私模糊算子参数: {params}")
        return params

    @staticmethod
    def _to_bool(value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "y", "on"}
        return bool(value)

    def _process_video_file(self, file_path, output_path, params, logger):
        self._ensure_ocr(params, logger)

        read_path, temp_input_path = self._prepare_video_input(file_path)
        temp_output_path = f"{output_path}.video.mp4"
        cap = None
        writer = None

        stats = {
            "input_file": file_path,
            "output_file": output_path,
            "ocr_runs": 0,
            "frames_total": 0,
            "frames_blurred": 0,
            "frames_with_sensitive_text": 0,
            "sensitive_hits": 0,
            "report_entries": 0,
            "timing_total_sec": 0.0,
            "timing_ocr_sec": 0.0,
            "timing_collect_sec": 0.0,
            "timing_tracking_sec": 0.0,
            "timing_blur_sec": 0.0,
            "timing_write_sec": 0.0,
            "timing_ffmpeg_sec": 0.0,
        }
        report_entries = []
        process_started_at = time.perf_counter()

        try:
            cap = cv2.VideoCapture(read_path)
            if not cap.isOpened():
                raise RuntimeError(f"无法打开视频文件: {file_path}")

            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            if params["max_duration_sec"] > 0 and fps > 0:
                total_frames = min(total_frames, int(round(fps * params["max_duration_sec"])))
            stats["frames_total"] = total_frames

            writer = cv2.VideoWriter(
                temp_output_path,
                cv2.VideoWriter_fourcc(*"mp4v"),
                fps,
                (width, height),
            )
            if not writer.isOpened():
                raise RuntimeError(f"无法创建输出视频: {temp_output_path}")

            logger.info(f"开始处理视频: {file_path}, size={width}x{height}, fps={fps}, frames={total_frames}")

            grace_frames = max(1, int(round(fps * params["tracker_max_age_sec"])))
            # grace_boxes: [{"box": (x1,y1,x2,y2), "remaining": int}]
            grace_boxes = []
            tracking_state = {
                "regions": [],
                "prev_frame": None,
                "remaining": 0,
                "stable_frames": 0,
            }
            frame_buffer = []
            last_ocr_frame = -10 ** 9
            frame_idx = 0

            while True:
                if frame_idx >= total_frames:
                    break
                ret, frame = cap.read()
                if not ret:
                    break

                active_boxes = (
                    self._regions_to_boxes(tracking_state["regions"])
                    if tracking_state["regions"] and tracking_state["remaining"] > 0
                    else grace_boxes
                )
                need_ocr = (
                    frame_idx == 0
                    or self._should_force_startup_ocr(frame_idx, last_ocr_frame, fps, params)
                    or self._should_retry_ocr_until_detect(frame_idx, last_ocr_frame, fps, active_boxes, params)
                    or self._should_periodic_ocr(frame_idx, last_ocr_frame, fps, active_boxes, params)
                )
                frame_buffer.append({
                    "frame_idx": frame_idx,
                    "frame": frame,
                    "need_ocr": need_ocr,
                })
                if need_ocr:
                    last_ocr_frame = frame_idx

                ocr_pending = sum(1 for entry in frame_buffer if entry["need_ocr"])
                should_flush = (
                    ocr_pending >= params["ocr_batch_size"]
                    or len(frame_buffer) >= params["batch_ocr_wait_buffer"]
                )

                frame_idx += 1
                if should_flush:
                    grace_boxes, tracking_state = self._flush_video_frame_buffer(
                        frame_buffer,
                        fps,
                        width,
                        height,
                        params,
                        logger,
                        stats,
                        report_entries,
                        writer,
                        grace_boxes,
                        grace_frames,
                        tracking_state,
                    )
                    frame_buffer = []

                if frame_idx % 100 == 0:
                    logger.info(
                        f"视频隐私模糊进度: {frame_idx}/{total_frames}, "
                        f"ocr_runs={stats['ocr_runs']}, frames_blurred={stats['frames_blurred']}, "
                        f"grace_boxes={len(grace_boxes)}, tracking_regions={len(tracking_state['regions'])}"
                    )

            if frame_buffer:
                grace_boxes, tracking_state = self._flush_video_frame_buffer(
                    frame_buffer,
                    fps,
                    width,
                    height,
                    params,
                    logger,
                    stats,
                    report_entries,
                    writer,
                    grace_boxes,
                    grace_frames,
                    tracking_state,
                )

            cap.release()
            cap = None
            writer.release()
            writer = None

            ffmpeg_elapsed = self._finalize_output(file_path, temp_output_path, output_path, params, logger)
            stats["timing_ffmpeg_sec"] += ffmpeg_elapsed
            stats["report_entries"] = len(report_entries)
            stats["timing_total_sec"] = time.perf_counter() - process_started_at
            self.last_run_stats[os.path.basename(file_path)] = stats
            logger.info(f"视频隐私模糊完成: {stats}")
            return 0
        finally:
            if cap is not None:
                cap.release()
            if writer is not None:
                writer.release()
            if temp_input_path and os.path.exists(temp_input_path):
                try:
                    os.remove(temp_input_path)
                except OSError:
                    pass
            if os.path.exists(temp_output_path) and not os.path.exists(output_path):
                try:
                    os.remove(temp_output_path)
                except OSError:
                    pass

    def _prepare_video_input(self, file_path):
        if self._is_ascii_path(file_path):
            return file_path, None

        suffix = os.path.splitext(file_path)[1] or ".mp4"
        fd, temp_path = tempfile.mkstemp(prefix="privacy_blur_", suffix=suffix)
        os.close(fd)
        shutil.copy2(file_path, temp_path)
        return temp_path, temp_path

    @staticmethod
    def _is_ascii_path(path):
        try:
            path.encode("ascii")
            return True
        except UnicodeEncodeError:
            return False

    def _ensure_ocr(self, params, logger):
        return

    def _collect_tracking_regions(self, frame, params, logger):
        boxes_to_blur = []
        sensitive_hits = 0
        report_entries = []
        items = self._run_ocr(frame, params, logger)
        merged_items = self._merge_text_items(items, params)
        all_items = items + merged_items

        for item in items:
            item_boxes, item_report_entries = self._extract_sensitive_boxes(item, frame, params)
            sensitive_hits += len(item_boxes)
            boxes_to_blur.extend(item_boxes)
            report_entries.extend(item_report_entries)

        for item in merged_items:
            item_boxes, item_report_entries = self._extract_sensitive_boxes(item, frame, params)
            sensitive_hits += len(item_boxes)
            boxes_to_blur.extend(item_boxes)
            report_entries.extend(item_report_entries)

        merged_boxes = self._merge_boxes(boxes_to_blur)
        merged_boxes = self._merge_boxes(merged_boxes)
        return self._build_tracking_regions(frame, merged_boxes), sensitive_hits, report_entries

    @staticmethod
    def _regions_to_boxes(regions):
        return [tuple(region["box"]) for region in regions if region.get("box")]

    def _build_tracking_regions(self, frame, boxes):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        regions = []
        for box in boxes:
            template = self._extract_region_template(gray, box)
            regions.append(
                {
                    "box": tuple(box),
                    "template": template,
                }
            )
        return regions

    def _adjust_tracking_regions(self, prev_frame, current_frame, regions, params):
        if not regions:
            return [], 0

        prev_gray = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
        current_gray = cv2.cvtColor(current_frame, cv2.COLOR_BGR2GRAY)
        frame_h, frame_w = current_gray.shape[:2]
        global_dx, global_dy = self._estimate_global_motion(prev_gray, current_gray, params)

        updated_regions = []
        adjusted_count = 0

        for region in regions:
            prev_box = tuple(region["box"])
            predicted_box = self._shift_box(prev_box, global_dx, global_dy, frame_w, frame_h)
            final_box = predicted_box
            template = region.get("template")

            matched_box, match_score = self._match_region_template(
                current_gray,
                predicted_box,
                template,
                params,
            )
            if matched_box is not None:
                final_box = self._smooth_box(predicted_box, matched_box, params, frame_w, frame_h)

            if final_box != prev_box:
                adjusted_count += 1

            updated_regions.append(
                {
                    "box": final_box,
                    "template": self._extract_region_template(current_gray, final_box),
                    "match_score": match_score,
                }
            )

        return updated_regions, adjusted_count

    @staticmethod
    def _extract_region_template(gray_frame, box):
        x1, y1, x2, y2 = box
        roi = gray_frame[y1:y2, x1:x2]
        if roi.size == 0:
            return None
        return roi.copy()

    @staticmethod
    def _shift_box(box, dx, dy, frame_w, frame_h):
        x1, y1, x2, y2 = box
        box_w = max(1, x2 - x1)
        box_h = max(1, y2 - y1)
        new_x1 = int(round(x1 + dx))
        new_y1 = int(round(y1 + dy))
        new_x1 = max(0, min(frame_w - box_w, new_x1))
        new_y1 = max(0, min(frame_h - box_h, new_y1))
        return (
            new_x1,
            new_y1,
            new_x1 + box_w,
            new_y1 + box_h,
        )

    def _estimate_global_motion(self, prev_gray, current_gray, params):
        scale = params["tracking_downscale"]
        if scale < 1.0:
            prev_small = cv2.resize(prev_gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
            current_small = cv2.resize(current_gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        else:
            prev_small = prev_gray
            current_small = current_gray

        try:
            shift, response = cv2.phaseCorrelate(
                np.float32(prev_small),
                np.float32(current_small),
            )
        except cv2.error:
            return 0.0, 0.0

        dx = shift[0] / scale
        dy = shift[1] / scale
        if response < 0.05:
            return 0.0, 0.0
        if abs(dx) > params["tracking_max_global_shift"] or abs(dy) > params["tracking_max_global_shift"]:
            return 0.0, 0.0
        return dx, dy

    def _match_region_template(self, current_gray, predicted_box, template, params):
        if template is None or template.size == 0:
            return None, None

        template_h, template_w = template.shape[:2]
        if template_h < 6 or template_w < 6:
            return None, None
        if float(np.std(template)) < 4.0:
            return None, None

        frame_h, frame_w = current_gray.shape[:2]
        radius = params["tracking_search_radius"]
        px1, py1, px2, py2 = predicted_box

        search_x1 = max(0, px1 - radius)
        search_y1 = max(0, py1 - radius)
        search_x2 = min(frame_w, px2 + radius)
        search_y2 = min(frame_h, py2 + radius)
        search_roi = current_gray[search_y1:search_y2, search_x1:search_x2]

        if search_roi.shape[0] < template_h or search_roi.shape[1] < template_w:
            return None, None

        match_result = cv2.matchTemplate(search_roi, template, cv2.TM_CCOEFF_NORMED)
        _, max_score, _, max_loc = cv2.minMaxLoc(match_result)
        if max_score < params["tracking_min_template_score"]:
            return None, float(max_score)

        new_x1 = search_x1 + max_loc[0]
        new_y1 = search_y1 + max_loc[1]
        return (
            new_x1,
            new_y1,
            new_x1 + template_w,
            new_y1 + template_h,
        ), float(max_score)

    @staticmethod
    def _smooth_box(predicted_box, matched_box, params, frame_w, frame_h):
        alpha = params["tracking_smooth_alpha"]
        box_w = max(1, predicted_box[2] - predicted_box[0])
        box_h = max(1, predicted_box[3] - predicted_box[1])
        x1 = int(round(predicted_box[0] * (1.0 - alpha) + matched_box[0] * alpha))
        y1 = int(round(predicted_box[1] * (1.0 - alpha) + matched_box[1] * alpha))
        x1 = max(0, min(frame_w - box_w, x1))
        y1 = max(0, min(frame_h - box_h, y1))
        return (
            x1,
            y1,
            x1 + box_w,
            y1 + box_h,
        )

    def _extract_sensitive_boxes(self, item, frame, params):
        matches = self._find_sensitive_matches(item["text"], params)
        if not matches:
            return [], []

        boxes = []
        report_entries = []
        for match in matches:
            start = match["start"]
            end = match["end"]
            start, end = self._trim_match_span_to_digit_core(item["text"], start, end, match)
            item_box = tuple(item["box"])
            frame_w = frame.shape[1]
            box_w_ratio = max(1, item_box[2] - item_box[0]) / max(1, frame_w)
            # 整框打码仅在框宽度合理时使用，太宽说明是合并后的跨列文本，退回精确定位
            if self._should_blur_full_item_box(match, item["text"], start, end) and box_w_ratio <= 0.25:
                span_box = item_box
            else:
                span_box = self._slice_box_by_span(item["box"], item["text"], start, end, params)
            if not self._is_box_reasonable(span_box, frame, params) and not self._is_sensitive_tall_narrow_box(span_box, frame):
                continue
            expanded_box = self._expand_box(
                span_box,
                frame.shape[1],
                frame.shape[0],
                params["box_expand_ratio"],
            )
            boxes.append(expanded_box)
            report_entries.append(
                {
                    "category": match["category"],
                    "match_text": item["text"][start:end],
                    "source_text": item["text"],
                    "box": list(expanded_box),
                    "match_mode": match.get("match_mode", "rule"),
                }
            )
        return boxes, report_entries

    @staticmethod
    def _should_blur_full_item_box(match, text="", start=0, end=0):
        category = str(match.get("category", ""))
        match_mode = str(match.get("match_mode", ""))
        if match_mode != "regex":
            return False
        if category not in {"phone", "id_card", "bank_card", "email", "ip", "sql_sensitive"}:
            return False

        text_len = max(1, len(str(text).strip()))
        span_len = max(0, int(end) - int(start))
        coverage_ratio = span_len / float(text_len)
        return coverage_ratio >= 0.75

    @staticmethod
    def _trim_match_span_to_digit_core(text, start, end, match):
        category = str(match.get("category", ""))
        if category not in {"phone", "id_card", "bank_card"}:
            return start, end

        text_len = len(text)
        start = max(0, min(text_len, int(start)))
        end = max(start, min(text_len, int(end)))
        if end <= start:
            return start, end

        while start < end and not (text[start].isdigit() or text[start] in "Xx"):
            start += 1
        while end > start and not (text[end - 1].isdigit() or text[end - 1] in "Xx"):
            end -= 1
        return start, end

    def _run_ocr(self, frame, params, logger):
        return self._run_remote_ocr(frame, params, logger)

    def _run_ocr_batch(self, frames, params, logger):
        return self._run_remote_ocr_batch(frames, params, logger)

    def _run_remote_ocr(self, frame, params, logger):
        ocr_frame, scale_x, scale_y = self._prepare_frame_for_ocr(frame, params)
        ok, encoded = cv2.imencode(".jpg", ocr_frame)
        if not ok:
            logger.warning("远程OCR前图像编码失败，本帧跳过")
            return []

        image_base64 = base64.b64encode(encoded.tobytes()).decode("ascii")
        request_payload = json.dumps({"image": image_base64}).encode("utf-8")
        service_url = params.get("ocr_service_url", self.REMOTE_OCR_SERVICE_URL)
        timeout_sec = max(3, int(params.get("ocr_service_timeout_sec", 30)))
        request = urllib.request.Request(
            service_url,
            data=request_payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=timeout_sec) as response:
                raw_payload = response.read().decode("utf-8")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            logger.warning(f"远程OCR请求失败，本帧跳过: {exc}")
            return []

        try:
            response_payload = json.loads(raw_payload)
        except json.JSONDecodeError as exc:
            logger.warning(f"远程OCR返回非JSON结果，本帧跳过: {exc}")
            return []

        words_block_list = []
        if isinstance(response_payload, dict):
            words_block_list = response_payload.get("result", {}).get("words_block_list", [])

        return self._parse_remote_ocr_words_block_list(words_block_list, scale_x, scale_y, params)

    def _run_remote_ocr_batch(self, frames, params, logger):
        if not frames:
            return []

        prepared_frames = []
        images_base64 = []
        for frame in frames:
            ocr_frame, scale_x, scale_y = self._prepare_frame_for_ocr(frame, params)
            ok, encoded = cv2.imencode(".jpg", ocr_frame)
            if not ok:
                prepared_frames.append(None)
                images_base64.append(None)
                continue
            prepared_frames.append((scale_x, scale_y))
            images_base64.append(base64.b64encode(encoded.tobytes()).decode("ascii"))

        valid_pairs = [
            (idx, image_base64) for idx, image_base64 in enumerate(images_base64)
            if image_base64 is not None
        ]
        if not valid_pairs:
            logger.warning("批量OCR前图像编码全部失败，本批次跳过")
            return [[] for _ in frames]

        request_payload = json.dumps(
            {
                "images": [item[1] for item in valid_pairs],
                "use_optimized": True,
            }
        ).encode("utf-8")
        service_url = params.get("ocr_batch_service_url", self.REMOTE_OCR_BATCH_SERVICE_URL)
        timeout_sec = max(3, int(params.get("ocr_service_timeout_sec", 30)))
        request = urllib.request.Request(
            service_url,
            data=request_payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=timeout_sec) as response:
                raw_payload = response.read().decode("utf-8")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            logger.warning(f"批量OCR请求失败，降级为逐帧OCR: {exc}")
            return [self._run_remote_ocr(frame, params, logger) for frame in frames]

        try:
            response_payload = json.loads(raw_payload)
        except json.JSONDecodeError as exc:
            logger.warning(f"批量OCR返回非JSON结果，降级为逐帧OCR: {exc}")
            return [self._run_remote_ocr(frame, params, logger) for frame in frames]

        raw_results = response_payload.get("results", []) if isinstance(response_payload, dict) else []
        parsed_results = [[] for _ in frames]
        for batch_index, (original_index, _) in enumerate(valid_pairs):
            if batch_index >= len(raw_results):
                continue
            result_item = raw_results[batch_index] if isinstance(raw_results[batch_index], dict) else {}
            words_block_list = result_item.get("words_block_list", [])
            scale_x, scale_y = prepared_frames[original_index]
            parsed_results[original_index] = self._parse_remote_ocr_words_block_list(
                words_block_list,
                scale_x,
                scale_y,
                params,
            )

        return parsed_results

    def _parse_remote_ocr_words_block_list(self, words_block_list, scale_x, scale_y, params):

        page_items = []
        for item in words_block_list:
            if not isinstance(item, dict):
                continue
            text = str(item.get("words", "")).strip()
            score = float(item.get("confidence", 0.0) or 0.0)
            points = item.get("location", [])
            if not text or score < params["min_ocr_score"] or not isinstance(points, list) or len(points) < 4:
                continue

            try:
                x_coords = [int(point[0] * scale_x) for point in points]
                y_coords = [int(point[1] * scale_y) for point in points]
            except (TypeError, ValueError, IndexError):
                continue

            box = (min(x_coords), min(y_coords), max(x_coords), max(y_coords))
            page_items.append(
                {
                    "box": box,
                    "text": text,
                    "score": score,
                    "width": max(1, box[2] - box[0]),
                    "height": max(1, box[3] - box[1]),
                    "center_y": (box[1] + box[3]) / 2.0,
                }
            )

        return page_items

    @staticmethod
    def _prepare_frame_for_ocr(frame, params):
        height, width = frame.shape[:2]
        max_width = int(params.get("ocr_max_width", 0) or 0)
        if max_width <= 0:
            return frame, 1.0, 1.0
        if width <= max_width:
            return frame, 1.0, 1.0

        scale = max_width / float(width)
        resized = cv2.resize(frame, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)
        scale_x = width / float(resized.shape[1])
        scale_y = height / float(resized.shape[0])
        return resized, scale_x, scale_y

    def _collect_sensitive_boxes_from_ocr_items(self, frame, ocr_items, frame_idx, fps, params, report_entries):
        frame_sensitive_hits = 0
        current_sensitive_boxes = []
        merged_items = self._merge_text_items(ocr_items, params)
        all_items = list(ocr_items) + list(merged_items)
        seen_report_keys = set()

        for item in all_items:
            if item.get("score", 1.0) < params["min_ocr_score"]:
                continue
            item_boxes, item_report_entries = self._extract_sensitive_boxes(item, frame, params)
            if not item_boxes:
                continue
            current_sensitive_boxes.extend(item_boxes)
            frame_sensitive_hits += len(item_report_entries)
            if params["emit_report"]:
                deduped_entries = []
                for entry in item_report_entries:
                    report_key = (
                        entry["category"],
                        entry["match_text"],
                        tuple(entry["box"]),
                    )
                    if report_key in seen_report_keys:
                        continue
                    seen_report_keys.add(report_key)
                    deduped_entries.append(entry)
                if deduped_entries:
                    self._append_report_entries(
                        report_entries,
                        deduped_entries,
                        frame_idx,
                        fps,
                        params["report_max_entries"],
                    )

        return frame_sensitive_hits, current_sensitive_boxes

    def _flush_video_frame_buffer(self, frame_buffer, fps, width, height, params, logger, stats, report_entries, writer, grace_boxes, grace_frames, tracking_state):
        if not frame_buffer:
            return grace_boxes, tracking_state

        ocr_entries = [entry for entry in frame_buffer if entry["need_ocr"]]
        ocr_results = {}
        if ocr_entries:
            ocr_started_at = time.perf_counter()
            batch_results = self._run_ocr_batch([entry["frame"] for entry in ocr_entries], params, logger)
            stats["timing_ocr_sec"] += time.perf_counter() - ocr_started_at
            stats["ocr_runs"] += len(ocr_entries)
            for entry, result in zip(ocr_entries, batch_results):
                ocr_results[entry["frame_idx"]] = result

        active_regions = list((tracking_state or {}).get("regions") or [])
        prev_tracking_frame = (tracking_state or {}).get("prev_frame")
        tracking_remaining = max(0, int((tracking_state or {}).get("remaining", 0)))
        stable_frames = max(0, int((tracking_state or {}).get("stable_frames", 0)))
        pending_output_entries = []

        for entry in frame_buffer:
            frame = entry["frame"]
            frame_idx = entry["frame_idx"]
            ocr_items = ocr_results.get(frame_idx, [])
            frame_sensitive_hits = 0
            current_sensitive_boxes = []
            scene_changed = True
            region_content_changed = True
            if prev_tracking_frame is not None:
                scene_changed = self._is_scene_changed(
                    prev_tracking_frame,
                    frame,
                    params["tracking_scene_change_threshold"],
                )
            if prev_tracking_frame is not None and active_regions:
                region_content_changed = self._is_region_content_changed(
                    prev_tracking_frame,
                    frame,
                    active_regions,
                    params["tracking_region_change_threshold"],
                )
            lifecycle_changed = scene_changed if not active_regions else region_content_changed

            if entry["need_ocr"]:
                collect_started_at = time.perf_counter()
                frame_sensitive_hits, current_sensitive_boxes = self._collect_sensitive_boxes_from_ocr_items(
                    frame,
                    ocr_items,
                    frame_idx,
                    fps,
                    params,
                    report_entries,
                )
                stats["timing_collect_sec"] += time.perf_counter() - collect_started_at
                current_sensitive_boxes = self._merge_boxes(current_sensitive_boxes)
                if current_sensitive_boxes:
                    active_regions = self._build_tracking_regions(frame, current_sensitive_boxes)
                    prev_tracking_frame = frame.copy()
                    tracking_remaining = grace_frames
                    stable_frames = 0
                elif active_regions and tracking_remaining > 0 and prev_tracking_frame is not None:
                    tracking_started_at = time.perf_counter()
                    active_regions, _ = self._adjust_tracking_regions(
                        prev_tracking_frame,
                        frame,
                        active_regions,
                        params,
                    )
                    stats["timing_tracking_sec"] += time.perf_counter() - tracking_started_at
                    current_sensitive_boxes = self._merge_boxes(self._regions_to_boxes(active_regions))
                    prev_tracking_frame = frame.copy()
                    tracking_remaining, stable_frames = self._update_tracking_lifecycle(
                        tracking_remaining,
                        stable_frames,
                        lifecycle_changed,
                        fps,
                        grace_frames,
                        params,
                    )
                else:
                    active_regions = []
                    prev_tracking_frame = None
                    tracking_remaining = 0
                    stable_frames = 0
            elif active_regions and tracking_remaining > 0 and prev_tracking_frame is not None:
                tracking_started_at = time.perf_counter()
                active_regions, _ = self._adjust_tracking_regions(
                    prev_tracking_frame,
                    frame,
                    active_regions,
                    params,
                )
                stats["timing_tracking_sec"] += time.perf_counter() - tracking_started_at
                current_sensitive_boxes = self._merge_boxes(self._regions_to_boxes(active_regions))
                prev_tracking_frame = frame.copy()
                tracking_remaining, stable_frames = self._update_tracking_lifecycle(
                    tracking_remaining,
                    stable_frames,
                    lifecycle_changed,
                    fps,
                    grace_frames,
                    params,
                )
            else:
                active_regions = []
                prev_tracking_frame = None
                tracking_remaining = 0
                stable_frames = 0

            if frame_sensitive_hits > 0:
                stats["sensitive_hits"] += frame_sensitive_hits
                stats["frames_with_sensitive_text"] += 1

            dynamic_grace_frames = self._get_dynamic_grace_frames(stable_frames, fps, grace_frames, params)
            new_grace = []
            for gb in grace_boxes:
                covered = any(self._boxes_overlap(gb["box"], sb) for sb in current_sensitive_boxes)
                if covered:
                    new_grace.append({"box": gb["box"], "remaining": dynamic_grace_frames})
                elif gb["remaining"] > 0:
                    new_grace.append({"box": gb["box"], "remaining": gb["remaining"] - 1})
            for sb in current_sensitive_boxes:
                if not any(self._boxes_overlap(sb, gb["box"]) for gb in new_grace):
                    new_grace.append({"box": sb, "remaining": dynamic_grace_frames})
            grace_boxes = new_grace

            blur_boxes = self._merge_boxes(
                list(current_sensitive_boxes) + [gb["box"] for gb in grace_boxes]
            )

            # Sensitive boxes have already been expanded when extracted from OCR spans.
            # Avoid a second expansion here, otherwise the final blur region becomes
            # visibly too large after merge/tracking/grace propagation.
            current_blur_boxes = list(blur_boxes)
            pending_output_entries.append(
                {
                    "frame_idx": frame_idx,
                    "frame": frame,
                    "blur_boxes": current_blur_boxes,
                }
            )

        pending_output_entries = self._apply_future_region_backfill(pending_output_entries, fps, params)
        for output_entry in pending_output_entries:
            blur_started_at = time.perf_counter()
            processed_frame = self._apply_blur(output_entry["frame"], output_entry["blur_boxes"], params)
            stats["timing_blur_sec"] += time.perf_counter() - blur_started_at
            if output_entry["blur_boxes"]:
                stats["frames_blurred"] += 1
            write_started_at = time.perf_counter()
            writer.write(processed_frame)
            stats["timing_write_sec"] += time.perf_counter() - write_started_at

        return grace_boxes, {
            "regions": active_regions,
            "prev_frame": prev_tracking_frame,
            "remaining": tracking_remaining,
            "stable_frames": stable_frames,
        }

    @staticmethod
    def _looks_like_line(raw_line):
        if not isinstance(raw_line, (list, tuple)) or len(raw_line) < 2:
            return False
        points = raw_line[0]
        return isinstance(points, (list, tuple)) and len(points) >= 4

    def _merge_text_items(self, items, params):
        if not items:
            return []

        sorted_items = sorted(items, key=lambda item: (item["center_y"], item["box"][0]))
        merged = []

        for item in sorted_items:
            if not merged:
                merged.append(dict(item))
                continue

            prev = merged[-1]
            same_row = abs(item["center_y"] - prev["center_y"]) <= (
                min(item["height"], prev["height"]) * params["merge_line_y_ratio"]
            )
            gap = item["box"][0] - prev["box"][2]
            merge_gap = min(item["height"], prev["height"]) * params["merge_line_gap_ratio"]

            if same_row and gap <= merge_gap:
                merged[-1] = {
                    "box": (
                        min(prev["box"][0], item["box"][0]),
                        min(prev["box"][1], item["box"][1]),
                        max(prev["box"][2], item["box"][2]),
                        max(prev["box"][3], item["box"][3]),
                    ),
                    "text": f"{prev['text']}{item['text']}",
                    "score": max(prev["score"], item["score"]),
                    "width": max(prev["box"][2], item["box"][2]) - min(prev["box"][0], item["box"][0]),
                    "height": max(prev["box"][3], item["box"][3]) - min(prev["box"][1], item["box"][1]),
                    "center_y": (min(prev["box"][1], item["box"][1]) + max(prev["box"][3], item["box"][3])) / 2.0,
                }
            else:
                merged.append(dict(item))

        return merged

    def _is_sensitive_text(self, text, params):
        if not text:
            return False

        normalized_text = text.strip()
        compact_text = re.sub(r"[\s:：\-_.]+", "", normalized_text)
        # 去除 OCR 噪声字符
        for ch in self._OCR_NOISE_CHARS:
            compact_text = compact_text.replace(ch, "")
        normalized_digits = self._normalize_digits_for_matching(compact_text)
        lowered_text = normalized_text.lower()

        for keyword in params["keywords"]:
            keyword = keyword.strip()
            if keyword and (keyword in normalized_text or keyword.lower() in lowered_text):
                return True

        if params["enable_phone"] and (
            re.search(r"(?<!\d)1[3-9]\d{9}(?!\d)", compact_text)
            or re.search(r"(?<!\d)1[3-9]\d{9}(?!\d)", normalized_digits)
        ):
            return True
        if params["enable_email"] and re.search(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", normalized_text):
            return True
        if params["enable_id_card"] and (
            re.search(r"(?<!\d)\d{17}[\dXx](?!\d)", compact_text)
            or re.search(r"(?<!\d)\d{17}[\dXx](?!\d)", normalized_digits)
        ):
            return True
        if params["enable_bank_card"] and (
            re.search(r"(?<!\d)\d{16,19}(?!\d)", compact_text)
            or re.search(r"(?<!\d)\d{16,19}(?!\d)", normalized_digits)
        ):
            return True
        if params["enable_ip"] and re.search(
            r"(?<!\d)(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(?!\d)",
            normalized_text,
        ):
            return True

        # 内置英文敏感列名/SQL 模式
        lowered_compact = compact_text.lower()
        for pattern in self._BUILTIN_SENSITIVE_PATTERNS:
            if pattern in lowered_compact:
                return True

        return False

    def _find_sensitive_matches(self, text, params):
        if not text:
            return []

        matches = []
        raw_text = text.strip()

        compact_text, compact_index_map = self._compact_text_with_index_map(raw_text)
        # OCR 数字归一化：在数字上下文中把常见字母误识别修正为数字
        normalized_compact = self._normalize_digits_for_matching(compact_text)

        if params["enable_phone"]:
            matches.extend(
                self._map_compact_matches(compact_text, compact_index_map, r"(?<!\d)1[3-9]\d{9}(?!\d)", "phone")
            )
            # 归一化后再匹配一轮，捕获 OCR 误识别的情况
            matches.extend(
                self._map_compact_matches(normalized_compact, compact_index_map, r"(?<!\d)1[3-9]\d{9}(?!\d)", "phone")
            )
            matches.extend(
                self._map_compact_matches(normalized_compact, compact_index_map, r"(?<!\d)1\d{7,13}(?!\d)", "phone")
            )
            matches.extend(
                self._find_contextual_raw_matches(
                    raw_text,
                    [
                        (r"(?i)(?:service\s*[_-]?\s*id|phone\s*[_-]?\s*no|phone\s*[_-]?\s*number|mobile\s*[_-]?\s*no|mobile\s*[_-]?\s*phone)\s*[:=]?\s*([0-9OIlSBZGq]{8,14})", "phone"),
                    ],
                    "context_regex",
                )
            )
        if params["enable_id_card"]:
            matches.extend(
                self._map_compact_matches(compact_text, compact_index_map, r"(?<!\d)\d{17}[\dXx](?!\d)", "id_card")
            )
            matches.extend(
                self._map_compact_matches(normalized_compact, compact_index_map, r"(?<!\d)\d{17}[\dXx](?!\d)", "id_card")
            )
            matches.extend(
                self._map_compact_matches(normalized_compact, compact_index_map, r"(?<!\d)\d{15,17}[\dXx]?(?!\d)", "id_card")
            )
            matches.extend(
                self._find_contextual_raw_matches(
                    raw_text,
                    [
                        (r"(?i)(?:cust\s*[_-]?\s*identity\s*[_-]?\s*code|identity\s*[_-]?\s*code|id\s*[_-]?\s*card\s*[_-]?\s*no|id\s*[_-]?\s*card)\s*[:=]?\s*([0-9OIlSBZGqXx]{12,20})", "id_card"),
                    ],
                    "context_regex",
                )
            )
        if params["enable_bank_card"]:
            matches.extend(
                self._map_compact_matches(compact_text, compact_index_map, r"(?<!\d)\d{16,19}(?!\d)", "bank_card")
            )
            matches.extend(
                self._map_compact_matches(normalized_compact, compact_index_map, r"(?<!\d)\d{16,19}(?!\d)", "bank_card")
            )
        if params["enable_email"]:
            for match in re.finditer(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", raw_text):
                matches.append(
                    {
                        "start": match.start(),
                        "end": match.end(),
                        "category": "email",
                        "match_mode": "regex",
                    }
                )

        if params["enable_ip"]:
            ip_pattern = r"(?<!\d)(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(?!\d)"
            for match in re.finditer(ip_pattern, raw_text):
                matches.append(
                    {
                        "start": match.start(),
                        "end": match.end(),
                        "category": "ip",
                        "match_mode": "regex",
                    }
                )

        for keyword in params["keywords"]:
            keyword = keyword.strip()
            if not keyword:
                continue
            matches.extend(self._find_keyword_value_matches(raw_text, keyword, params))

        # 内置英文敏感列名/SQL 模式：匹配到则整段文本打码
        lowered_compact = compact_text.lower()
        for pattern in self._BUILTIN_SENSITIVE_PATTERNS:
            if pattern in lowered_compact:
                matches.append(
                    {
                        "start": 0,
                        "end": len(raw_text),
                        "category": "sql_sensitive",
                        "match_mode": "builtin_pattern",
                    }
                )
                break

        matches = self._prune_broad_sql_sensitive_matches(matches)
        return self._merge_match_entries(matches, len(raw_text))

    @staticmethod
    def _prune_broad_sql_sensitive_matches(matches):
        """
        If a whole-line sql_sensitive builtin match fully covers a more specific
        regex/keyword sensitive span, prefer the narrower span for box slicing.
        This avoids blurring an entire SQL line when the real target is only a
        phone number or ID number inside that line.
        """
        if not matches:
            return []

        specific_matches = []
        broad_matches = []
        for item in matches:
            category = str(item.get("category", ""))
            match_mode = str(item.get("match_mode", ""))
            if category == "sql_sensitive" and match_mode == "builtin_pattern":
                broad_matches.append(item)
            else:
                specific_matches.append(item)

        if not broad_matches or not specific_matches:
            return matches

        kept_broad_matches = []
        for broad in broad_matches:
            broad_start = int(broad["start"])
            broad_end = int(broad["end"])
            covered_by_specific = False
            for specific in specific_matches:
                specific_start = int(specific["start"])
                specific_end = int(specific["end"])
                if specific_start >= broad_start and specific_end <= broad_end:
                    covered_by_specific = True
                    break
            if not covered_by_specific:
                kept_broad_matches.append(broad)

        return specific_matches + kept_broad_matches

    # OCR 常见字母→数字混淆映射（仅在数字上下文中使用）
    _OCR_DIGIT_MAP = {
        "O": "0", "o": "0", "Q": "0", "D": "0",
        "l": "1", "I": "1", "i": "1", "|": "1",
        "Z": "2", "z": "2",
        "S": "5", "s": "5",
        "G": "6",
        "T": "7",
        "B": "8",
        "g": "9", "q": "9",
    }
    # OCR 噪声字符：在 compact 时直接跳过
    _OCR_NOISE_CHARS = set("·•*※◆◇○●□■△▲▽▼☆★♦♠♣♥~`")

    @staticmethod
    def _compact_text_with_index_map(text):
        compact_chars = []
        index_map = []
        noise = EnhanceVideoPrivacyBlurOperator._OCR_NOISE_CHARS
        for index, char in enumerate(text):
            if re.match(r"[\s:：\-_.]", char):
                continue
            if char in noise:
                continue
            compact_chars.append(char)
            index_map.append(index)
        return "".join(compact_chars), index_map

    @staticmethod
    def _normalize_digits_for_matching(text):
        """将 OCR 常见字母误识别归一化为数字，用于正则匹配前的预处理。
        多轮迭代：每轮新产生的数字可以帮助相邻字符在下一轮被转换。"""
        digit_map = EnhanceVideoPrivacyBlurOperator._OCR_DIGIT_MAP
        chars = list(text)
        length = len(chars)
        changed = True
        while changed:
            changed = False
            for i, ch in enumerate(chars):
                if ch in digit_map:
                    has_neighbor_digit = False
                    for offset in (-2, -1, 1, 2):
                        ni = i + offset
                        if 0 <= ni < length and chars[ni].isdigit():
                            has_neighbor_digit = True
                            break
                    if has_neighbor_digit:
                        chars[i] = digit_map[ch]
                        changed = True
        return "".join(chars)

    @staticmethod
    def _map_compact_matches(compact_text, index_map, pattern, category):
        spans = []
        for match in re.finditer(pattern, compact_text):
            start_index = index_map[match.start()]
            end_index = index_map[match.end() - 1] + 1
            spans.append(
                {
                    "start": start_index,
                    "end": end_index,
                    "category": category,
                    "match_mode": "regex",
                }
            )
        return spans

    @staticmethod
    def _find_contextual_numeric_matches(compact_text, index_map, pattern_specs, match_mode):
        spans = []
        for pattern, category in pattern_specs:
            for match in re.finditer(pattern, compact_text):
                if match.lastindex is None or match.lastindex < 1:
                    continue
                group_start = match.start(1)
                group_end = match.end(1)
                if group_end <= group_start:
                    continue
                start_index = index_map[group_start]
                end_index = index_map[group_end - 1] + 1
                spans.append(
                    {
                        "start": start_index,
                        "end": end_index,
                        "category": category,
                        "match_mode": match_mode,
                    }
                )
        return spans

    @staticmethod
    def _find_contextual_raw_matches(text, pattern_specs, match_mode):
        spans = []
        for pattern, category in pattern_specs:
            for match in re.finditer(pattern, text):
                if match.lastindex is None or match.lastindex < 1:
                    continue
                group_start = match.start(1)
                group_end = match.end(1)
                if group_end <= group_start:
                    continue
                spans.append(
                    {
                        "start": group_start,
                        "end": group_end,
                        "category": category,
                        "match_mode": match_mode,
                    }
                )
        return spans

    @staticmethod
    def _find_keyword_value_matches(text, keyword, params):
        matches = []
        start_at = 0
        text_len = len(text)
        while True:
            keyword_index = text.find(keyword, start_at)
            if keyword_index < 0:
                break

            after_keyword = keyword_index + len(keyword)
            value_start = after_keyword
            separator_match = re.match(r"[\s:：=]{0,4}", text[after_keyword:])
            if separator_match:
                value_start = after_keyword + separator_match.end()
            while value_start < text_len and text[value_start].isspace():
                value_start += 1

            if value_start < text_len:
                value_end = min(text_len, value_start + params["keyword_value_lookahead_chars"])

                boundary_match = re.search(r"[，,；;。|]", text[value_start:value_end])
                if boundary_match:
                    value_end = value_start + boundary_match.start()

                next_label_index = -1
                for other_keyword in params["keywords"]:
                    other_keyword = str(other_keyword).strip()
                    if not other_keyword:
                        continue
                    candidate = text.find(other_keyword, value_start + 1)
                    if candidate >= 0 and (next_label_index < 0 or candidate < next_label_index):
                        next_label_index = candidate
                if next_label_index >= 0:
                    value_end = min(value_end, next_label_index)

                while value_end > value_start and text[value_end - 1].isspace():
                    value_end -= 1

                value_text = text[value_start:value_end].strip()
                if len(value_text) >= 2 and re.search(r"[0-9A-Za-z@*xX一-龥]", value_text):
                    matches.append(
                        {
                            "start": value_start,
                            "end": value_end,
                            "category": keyword,
                            "match_mode": "keyword_value",
                        }
                    )

            start_at = keyword_index + len(keyword)

        return matches

    @staticmethod
    def _merge_match_entries(matches, text_length):
        valid_matches = []
        for item in matches:
            start = max(0, int(item["start"]))
            end = min(text_length, int(item["end"]))
            if end > start:
                normalized_item = dict(item)
                normalized_item["start"] = start
                normalized_item["end"] = end
                valid_matches.append(normalized_item)

        if not valid_matches:
            return []

        valid_matches.sort(key=lambda item: (item["start"], item["end"]))
        merged = [valid_matches[0]]
        for item in valid_matches[1:]:
            start = item["start"]
            end = item["end"]
            prev_start, prev_end = merged[-1]["start"], merged[-1]["end"]
            if start <= prev_end:
                merged[-1]["end"] = max(prev_end, end)
                prev_category = str(merged[-1].get("category", ""))
                current_category = str(item.get("category", ""))
                if current_category and current_category not in prev_category:
                    merged[-1]["category"] = f"{prev_category}|{current_category}" if prev_category else current_category
            else:
                merged.append(item)
        return merged

    @staticmethod
    def _should_force_startup_ocr(frame_idx, last_ocr_frame, fps, params):
        warmup_duration_frames = int(round(max(0.0, fps) * params["startup_force_ocr_duration_sec"]))
        if frame_idx > warmup_duration_frames:
            return False
        return frame_idx - last_ocr_frame >= params["startup_force_ocr_interval_frames"]

    @staticmethod
    def _should_retry_ocr_until_detect(frame_idx, last_ocr_frame, fps, current_regions, params):
        if current_regions:
            return False
        # 无论在视频哪个位置，只要当前没有打码区域就高频重试
        return frame_idx - last_ocr_frame >= params["retry_ocr_interval_frames_no_detection"]

    @staticmethod
    def _should_periodic_ocr(frame_idx, last_ocr_frame, fps, current_regions, params):
        """有活跃敏感区域时降低 OCR 频率，没区域时保持原有兜底抽检。"""
        interval_sec = params.get("region_recheck_interval_sec", 4.0) if current_regions else params.get("periodic_ocr_interval_sec", 2.0)
        if interval_sec <= 0 or fps <= 0:
            return False
        interval_frames = max(1, int(round(fps * interval_sec)))
        return frame_idx - last_ocr_frame >= interval_frames

    @staticmethod
    def _update_tracking_lifecycle(tracking_remaining, stable_frames, scene_changed, fps, grace_frames, params):
        bonus_max_frames = max(0, int(round(max(0.0, params["tracking_stable_bonus_max_sec"]) * max(fps, 0.0))))
        if scene_changed:
            stable_frames = 0
            tracking_remaining = max(0, tracking_remaining - params["tracking_decay_on_scene_change"])
        else:
            stable_frames = min(bonus_max_frames, stable_frames + 1)
            dynamic_limit = grace_frames + stable_frames
            tracking_remaining = min(dynamic_limit, max(1, tracking_remaining) + 1)
        return tracking_remaining, stable_frames

    @staticmethod
    def _get_dynamic_grace_frames(stable_frames, fps, grace_frames, params):
        max_grace_frames = max(
            grace_frames,
            int(round(max(0.0, params.get("tracking_region_grace_max_sec", 16.0)) * max(fps, 0.0)))
        )
        return max(grace_frames, min(max_grace_frames, grace_frames + stable_frames))

    def _apply_future_region_backfill(self, pending_output_entries, fps, params):
        if not pending_output_entries or fps <= 0:
            return pending_output_entries

        lookahead_frames = max(0, int(round(max(0.0, params.get("future_backfill_window_sec", 0.0)) * fps)))
        max_new_boxes = max(1, int(params.get("future_backfill_max_new_boxes", 12)))
        if lookahead_frames <= 0:
            return pending_output_entries

        known_boxes = []
        for idx, entry in enumerate(pending_output_entries):
            current_boxes = list(entry.get("blur_boxes", []))
            new_boxes = []
            for box in current_boxes:
                if any(self._boxes_overlap(box, seen_box) for seen_box in known_boxes):
                    continue
                new_boxes.append(box)
                known_boxes.append(box)

            if not new_boxes:
                continue

            new_boxes = new_boxes[:max_new_boxes]
            for prev_idx in range(idx - 1, -1, -1):
                prev_entry = pending_output_entries[prev_idx]
                if entry["frame_idx"] - prev_entry["frame_idx"] > lookahead_frames:
                    break
                prev_boxes = list(prev_entry.get("blur_boxes", []))
                merged_boxes = list(prev_boxes)
                appended = False
                for new_box in new_boxes:
                    if any(self._boxes_overlap(new_box, prev_box) for prev_box in merged_boxes):
                        continue
                    merged_boxes.append(new_box)
                    appended = True
                if appended:
                    prev_entry["blur_boxes"] = self._merge_boxes(merged_boxes)
        return pending_output_entries

    @staticmethod
    def _append_report_entries(report_entries, frame_report_entries, frame_idx, fps, max_entries):
        if len(report_entries) >= max_entries:
            return

        for item in frame_report_entries:
            if len(report_entries) >= max_entries:
                break
            report_entries.append(
                {
                    "frame_index": frame_idx,
                    "time_sec": round(frame_idx / fps, 3) if fps > 0 else 0.0,
                    "category": item["category"],
                    "match_text": item["match_text"],
                    "source_text": item["source_text"],
                    "box": item["box"],
                    "match_mode": item["match_mode"],
                }
            )

    @staticmethod
    def _write_privacy_report(report_path, input_file, output_file, stats, report_entries):
        summary = {}
        for item in report_entries:
            category = item["category"]
            summary[category] = summary.get(category, 0) + 1

        report = {
            "input_file": input_file,
            "output_file": output_file,
            "stats": stats,
            "summary_by_category": summary,
            "detections": report_entries,
        }
        with open(report_path, "w", encoding="utf-8") as report_file:
            json.dump(report, report_file, ensure_ascii=False, indent=2)

    @staticmethod
    def _char_visual_weight(char):
        if char.isspace():
            return 0.15
        if re.match(r"[0-9A-Za-z@._+\-]", char):
            return 0.75
        if char in ":：;；,，.。()（）[]【】":
            return 0.35
        return 1.0

    def _slice_box_by_span(self, box, text, start, end, params):
        x1, y1, x2, y2 = box
        if end <= start:
            return box

        weights = [self._char_visual_weight(char) for char in text]
        total_weight = sum(weights) or 1.0
        start_weight = sum(weights[:start])
        end_weight = sum(weights[:end])

        span_ratio = (end_weight - start_weight) / total_weight
        if span_ratio < params["min_sensitive_span_ratio"]:
            center_weight = (start_weight + end_weight) / 2.0
            min_span_weight = total_weight * params["min_sensitive_span_ratio"]
            start_weight = max(0.0, center_weight - min_span_weight / 2.0)
            end_weight = min(total_weight, center_weight + min_span_weight / 2.0)

        box_width = max(1, x2 - x1)
        span_x1 = x1 + int(box_width * (start_weight / total_weight))
        span_x2 = x1 + int(box_width * (end_weight / total_weight))
        span_x2 = max(span_x1 + 1, span_x2)
        span_x2 = min(x2, span_x2)

        return (span_x1, y1, span_x2, y2)

    @staticmethod
    def _expand_box(box, width, height, expand_ratio):
        x1, y1, x2, y2 = box
        box_w = max(1, x2 - x1)
        box_h = max(1, y2 - y1)
        expand_x = int(box_w * expand_ratio)
        expand_y = int(box_h * expand_ratio)
        return (
            max(0, x1 - expand_x),
            max(0, y1 - expand_y),
            min(width, x2 + expand_x),
            min(height, y2 + expand_y),
        )

    def _merge_boxes(self, boxes):
        if not boxes:
            return []

        pending = [tuple(box) for box in boxes]
        merged = True
        while merged:
            merged = False
            new_pending = []
            while pending:
                current = pending.pop(0)
                merged_with_current = False
                for index, other in enumerate(pending):
                    if self._boxes_should_merge(current, other):
                        current = (
                            min(current[0], other[0]),
                            min(current[1], other[1]),
                            max(current[2], other[2]),
                            max(current[3], other[3]),
                        )
                        pending.pop(index)
                        pending.insert(0, current)
                        merged = True
                        merged_with_current = True
                        break
                if not merged_with_current:
                    new_pending.append(current)
            pending = new_pending

        return sorted(pending, key=lambda box: (box[1], box[0]))


    @staticmethod
    def _boxes_overlap(box_a, box_b):
        """两个框是否有交集（用于 grace 合并判断）。"""
        ax1, ay1, ax2, ay2 = box_a
        bx1, by1, bx2, by2 = box_b
        return ax1 < bx2 and ax2 > bx1 and ay1 < by2 and ay2 > by1

    @staticmethod
    def _boxes_should_merge(box_a, box_b):
        ax1, ay1, ax2, ay2 = box_a
        bx1, by1, bx2, by2 = box_b

        overlap_x = max(0, min(ax2, bx2) - max(ax1, bx1))
        overlap_y = max(0, min(ay2, by2) - max(ay1, by1))
        gap_x = max(0, max(ax1, bx1) - min(ax2, bx2))
        min_h = max(1, min(ay2 - ay1, by2 - by1))

        if overlap_x > 0 and overlap_y > 0:
            return True
        if overlap_y > 0 and gap_x <= min_h * 0.6:
            return True
        return False

    @staticmethod
    def _is_box_reasonable(box, frame, params):
        frame_h, frame_w = frame.shape[:2]
        frame_area = max(1, frame_h * frame_w)
        x1, y1, x2, y2 = box
        box_w = max(1, x2 - x1)
        box_h = max(1, y2 - y1)
        box_area_ratio = (box_w * box_h) / frame_area
        box_h_ratio = box_h / max(1, frame_h)
        box_w_ratio = box_w / max(1, frame_w)

        if box_area_ratio > params["max_box_area_ratio"]:
            return False
        if box_h_ratio > params["max_box_height_ratio"]:
            return False
        if box_w_ratio > params["max_box_width_ratio"]:
            return False
        return True

    @staticmethod
    def _is_sensitive_tall_narrow_box(box, frame):
        frame_h, frame_w = frame.shape[:2]
        x1, y1, x2, y2 = box
        box_w = max(1, x2 - x1)
        box_h = max(1, y2 - y1)
        box_h_ratio = box_h / max(1, frame_h)
        box_w_ratio = box_w / max(1, frame_w)

        return box_h_ratio <= 0.55 and box_w_ratio <= 0.30

    def _apply_blur(self, frame, boxes, params):
        if not boxes:
            return frame

        output = frame.copy()
        for box in boxes:
            x1, y1, x2, y2 = box
            roi = output[y1:y2, x1:x2]
            if roi.size == 0:
                continue

            kernel = int(max(roi.shape[0], roi.shape[1]) * params["blur_ratio"])
            kernel = max(params["min_blur_kernel"], min(params["max_blur_kernel"], kernel))
            if kernel % 2 == 0:
                kernel += 1

            output[y1:y2, x1:x2] = cv2.GaussianBlur(roi, (kernel, kernel), 0)
        return output

    @staticmethod
    def _is_scene_changed(frame_a, frame_b, threshold):
        if frame_a is None or frame_b is None:
            return True

        gray_a = cv2.cvtColor(frame_a, cv2.COLOR_BGR2GRAY)
        gray_b = cv2.cvtColor(frame_b, cv2.COLOR_BGR2GRAY)
        diff = cv2.absdiff(gray_a, gray_b)
        return float(np.mean(diff)) > threshold

    def _is_region_content_changed(self, frame_a, frame_b, regions, threshold):
        if frame_a is None or frame_b is None or not regions:
            return True

        merged_boxes = self._merge_boxes(
            [tuple(region["box"]) for region in regions if region.get("box")]
        )
        if not merged_boxes:
            return True

        gray_a = cv2.cvtColor(frame_a, cv2.COLOR_BGR2GRAY)
        gray_b = cv2.cvtColor(frame_b, cv2.COLOR_BGR2GRAY)
        diffs = []
        for box in merged_boxes:
            x1, y1, x2, y2 = box
            roi_a = gray_a[y1:y2, x1:x2]
            roi_b = gray_b[y1:y2, x1:x2]
            if roi_a.size == 0 or roi_b.size == 0 or roi_a.shape != roi_b.shape:
                continue
            diffs.append(float(np.mean(cv2.absdiff(roi_a, roi_b))))
        if not diffs:
            return True
        return max(diffs) > threshold

    def _finalize_output(self, source_video, temp_output_path, final_output_path, params, logger):
        os.makedirs(os.path.dirname(final_output_path), exist_ok=True)
        finalize_started_at = time.perf_counter()

        ffmpeg_exe = self._get_ffmpeg_exe()
        if ffmpeg_exe:
            merged = self._export_h264_with_ffmpeg(
                ffmpeg_exe,
                source_video,
                temp_output_path,
                final_output_path,
                params,
                logger,
            )
            if merged:
                return time.perf_counter() - finalize_started_at

        if os.path.exists(final_output_path):
            os.remove(final_output_path)
        os.replace(temp_output_path, final_output_path)
        logger.warning("当前环境未完成 H.264 导出，退回原始 mp4v 输出，前端兼容性可能较差")

        return time.perf_counter() - finalize_started_at

    @staticmethod
    def _export_h264_with_ffmpeg(ffmpeg_exe, source_video, temp_output_path, final_output_path, params, logger):
        if params["keep_audio"]:
            command = [
                ffmpeg_exe,
                "-y",
                "-i",
                temp_output_path,
                "-i",
                source_video,
                "-map",
                "0:v:0",
                "-map",
                "1:a:0?",
                "-c:v",
                "libx264",
                "-c:a",
                "aac",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                "-shortest",
                final_output_path,
            ]
        else:
            command = [
                ffmpeg_exe,
                "-y",
                "-i",
                temp_output_path,
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                final_output_path,
            ]

        result = EnhanceVideoPrivacyBlurOperator._run_command_capture(command)
        if result.returncode == 0:
            os.remove(temp_output_path)
            logger.info("ffmpeg H.264 视频导出完成")
            return True

        logger.warning(f"ffmpeg H.264 视频导出失败，退回原始输出: {result.stderr[-300:]}")
        return False

    @staticmethod
    def _run_command_capture(command):
        result = subprocess.run(command, capture_output=True)
        result.stdout = EnhanceVideoPrivacyBlurOperator._decode_subprocess_output(result.stdout)
        result.stderr = EnhanceVideoPrivacyBlurOperator._decode_subprocess_output(result.stderr)
        return result

    @staticmethod
    def _decode_subprocess_output(output):
        if output is None:
            return ""
        if isinstance(output, str):
            return output
        for encoding in ("utf-8", "gb18030", "gbk"):
            try:
                return output.decode(encoding)
            except UnicodeDecodeError:
                continue
        return output.decode("utf-8", errors="replace")

    @staticmethod
    def _get_ffmpeg_exe():
        ffmpeg_exe = shutil.which("ffmpeg")
        if ffmpeg_exe:
            return ffmpeg_exe
        try:
            import imageio_ffmpeg
            imageio_ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
            if imageio_ffmpeg_exe:
                return imageio_ffmpeg_exe
        except Exception:
            pass
        bundled_ffmpeg = os.path.abspath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "audio",
                "filter",
                "ffmpeg",
            )
        )
        if os.path.exists(bundled_ffmpeg) and os.name != "nt":
            return bundled_ffmpeg
        return None

    @classmethod
    def _is_video_file(cls, file_name):
        return file_name.lower().endswith(cls.VIDEO_EXTENSIONS)

    @classmethod
    def _is_known_unsupported_video_file(cls, file_name):
        return file_name.lower().endswith(cls.UNSUPPORTED_VIDEO_EXTENSIONS)
