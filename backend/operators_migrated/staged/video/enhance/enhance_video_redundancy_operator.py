import json
import os
import shutil
import subprocess
import tempfile
import wave
import base64
import urllib.error
import urllib.request
from difflib import SequenceMatcher

import cv2
import numpy as np

from clientApp.operator.operators.operator_abs import OperatorAbs
from clientApp.utils.enum.format_enum import FileFormatType
from clientApp.utils.file_info_util import process_file_info
from clientApp.utils.file_utils import is_dir_empty, is_directory_exists


"""
V4004 视频冗余增强算子
"""


class EnhanceVideoRedundancyOperator(OperatorAbs):
    REMOTE_OCR_SERVICE_URL = "http://137.4.5.110:6663/ocr/single"
    UNSUPPORTED_VIDEO_EXTENSIONS = (".ts", ".m4v")
    DEFAULT_PARAMS = {
        "scene_diff_threshold": 10.0,
        "pixel_change_threshold": 0.018,
        "pixel_binary_threshold": 18,
        "ocr_interval_frames": 20,
        "text_change_threshold": 0.12,
        "silent_keep_fps": 5.0,
        "active_keep_fps": 30.0,
        "always_keep_first_frame": True,
        "always_keep_last_frame": True,
        "keep_audio": True,
        "emit_metadata": True,
        "use_ocr": True,
        "use_audio": True,
        "ocr_lang": "ch",
        "use_angle_cls": True,
        "merge_line_y_ratio": 0.60,
        "merge_line_gap_ratio": 0.55,
        "min_ocr_score": 0.45,
        "active_score_threshold": 0.45,
        "text_score_weight": 0.35,
        "pixel_score_weight": 0.65,
        "keep_all_active_frames": True,
        "audio_sample_rate": 16000,
        "audio_rms_threshold": 0.008,
        "audio_hangover_frames": 2,
        "active_enter_score_threshold": 0.45,
        "active_exit_score_threshold": 0.28,
        "silent_pixel_max_threshold": 0.006,
        "silent_text_max_threshold": 0.04,
        "active_state_min_frames": 10,
        "silent_state_min_frames": 20,
        "silent_state_min_duration_sec": 1.5,
        "emit_timeline_mapping": True,
        "pixel_compare_max_width": 640,
        "ocr_pixel_trigger_ratio": 1.35,
        "audio_short_circuit_ocr": True,
        "fast_profile": "balanced",
        "max_duration_sec": 0,
    }

    VIDEO_EXTENSIONS = FileFormatType.video.value

    def __init__(self):
        self.last_run_stats = {}
        self.last_run_debug = {}

    def process(self, operator_id, source_path, sink_path, param, logger, config_dict):
        res_data = []
        if not is_directory_exists(source_path) or is_dir_empty(source_path):
            logger.warning(f"视频冗余过滤算子输入目录不存在或为空: {source_path}")
            return res_data

        os.makedirs(sink_path, exist_ok=True)
        params = self._parse_params(param, logger)
        processable_file_count = 0
        success_file_count = 0

        for file_name in os.listdir(source_path):
            file_path = os.path.join(source_path, file_name)
            output_path = os.path.join(sink_path, file_name)
            try:
                if not os.path.isfile(file_path):
                    continue

                if self._is_video_file(file_name):
                    processable_file_count += 1
                    result = self._process_video_file(file_path, output_path, params, logger)
                    if result == 0:
                        success_file_count += 1
                    res_data.append(process_file_info(operator_id, file_path, output_path, result))
                elif self._is_known_unsupported_video_file(file_name):
                    processable_file_count += 1
                    logger.warning(f"视频冗余过滤算子暂不支持该视频格式，按处理失败记录: {file_name}")
                    res_data.append(process_file_info(operator_id, file_path, output_path, 1))
                else:
                    res_data.append(process_file_info(operator_id, file_path, output_path, 2))
            except Exception as exc:
                logger.error(f"视频冗余过滤处理失败: {file_name}, error={exc}", exc_info=True)
                if os.path.exists(output_path):
                    try:
                        os.remove(output_path)
                    except OSError:
                        pass
                res_data.append(process_file_info(operator_id, file_path, output_path, 1))

        if processable_file_count > 0 and success_file_count == 0:
            raise RuntimeError("视频冗余过滤算子所有可处理文件均失败，任务应判定为失败")

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
                logger.warning(f"视频冗余过滤参数解析失败，使用默认配置: {exc}")

        if not isinstance(raw_params, dict):
            raw_params = {}

        params.update(raw_params)
        params["scene_diff_threshold"] = float(params["scene_diff_threshold"])
        params["pixel_change_threshold"] = float(params["pixel_change_threshold"])
        params["pixel_binary_threshold"] = int(params["pixel_binary_threshold"])
        params["ocr_interval_frames"] = max(1, int(params["ocr_interval_frames"]))
        params["text_change_threshold"] = float(params["text_change_threshold"])
        params["silent_keep_fps"] = max(5.0, float(params["silent_keep_fps"]))
        params["active_keep_fps"] = max(params["silent_keep_fps"], float(params["active_keep_fps"]))
        params["always_keep_first_frame"] = self._to_bool(params["always_keep_first_frame"])
        params["always_keep_last_frame"] = self._to_bool(params["always_keep_last_frame"])
        params["keep_audio"] = self._to_bool(params["keep_audio"])
        params["emit_metadata"] = self._to_bool(params["emit_metadata"])
        params["use_ocr"] = self._to_bool(params["use_ocr"])
        params["use_audio"] = self._to_bool(params["use_audio"])
        params["use_angle_cls"] = self._to_bool(params["use_angle_cls"])
        params["merge_line_y_ratio"] = float(params["merge_line_y_ratio"])
        params["merge_line_gap_ratio"] = float(params["merge_line_gap_ratio"])
        params["min_ocr_score"] = float(params["min_ocr_score"])
        params["active_score_threshold"] = float(params["active_score_threshold"])
        params["text_score_weight"] = float(params["text_score_weight"])
        params["pixel_score_weight"] = float(params["pixel_score_weight"])
        params["keep_all_active_frames"] = self._to_bool(params.get("keep_all_active_frames", True))
        params["audio_sample_rate"] = int(params["audio_sample_rate"])
        params["audio_rms_threshold"] = float(params["audio_rms_threshold"])
        params["audio_hangover_frames"] = max(0, int(params["audio_hangover_frames"]))
        params["active_enter_score_threshold"] = float(params.get("active_enter_score_threshold", params["active_score_threshold"]))
        params["active_exit_score_threshold"] = float(params.get("active_exit_score_threshold", min(params["active_score_threshold"], 0.28)))
        params["silent_pixel_max_threshold"] = max(
            0.0,
            float(params.get("silent_pixel_max_threshold", min(params["pixel_change_threshold"] * 0.35, 0.006)))
        )
        params["silent_text_max_threshold"] = max(
            0.0,
            float(params.get("silent_text_max_threshold", min(params["text_change_threshold"] * 0.35, 0.04)))
        )
        params["active_state_min_frames"] = max(1, int(params.get("active_state_min_frames", 10)))
        params["silent_state_min_frames"] = max(1, int(params.get("silent_state_min_frames", 20)))
        params["silent_state_min_duration_sec"] = max(1.5, float(params.get("silent_state_min_duration_sec", 1.5)))
        params["emit_timeline_mapping"] = self._to_bool(params.get("emit_timeline_mapping", True))
        params["pixel_compare_max_width"] = max(160, int(params.get("pixel_compare_max_width", 640)))
        params["ocr_pixel_trigger_ratio"] = max(1.0, float(params.get("ocr_pixel_trigger_ratio", 1.35)))
        params["audio_short_circuit_ocr"] = self._to_bool(params.get("audio_short_circuit_ocr", True))
        params["fast_profile"] = str(params.get("fast_profile", "balanced")).strip().lower() or "balanced"
        params["max_duration_sec"] = max(0, int(params.get("max_duration_sec", 0)))
        self._apply_fast_profile(params)
        logger.info(f"视频冗余过滤算子参数: {params}")
        return params

    @staticmethod
    def _to_bool(value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "y", "on"}
        return bool(value)

    @staticmethod
    def _apply_fast_profile(params):
        profile = params.get("fast_profile", "balanced")
        if profile == "fast":
            params["ocr_interval_frames"] = max(params["ocr_interval_frames"], 180)
            params["ocr_max_width"] = min(int(params.get("ocr_max_width", 1280)), 960)
            params["pixel_compare_max_width"] = min(params["pixel_compare_max_width"], 480)
            params["ocr_pixel_trigger_ratio"] = max(params["ocr_pixel_trigger_ratio"], 1.8)
        elif profile == "faster":
            params["ocr_interval_frames"] = max(params["ocr_interval_frames"], 240)
            params["ocr_max_width"] = min(int(params.get("ocr_max_width", 1280)), 832)
            params["pixel_compare_max_width"] = min(params["pixel_compare_max_width"], 416)
            params["ocr_pixel_trigger_ratio"] = max(params["ocr_pixel_trigger_ratio"], 2.2)

    def _process_video_file(self, file_path, output_path, params, logger):
        if params["use_ocr"]:
            self._ensure_ocr(params, logger)

        read_path, temp_input_path = self._prepare_video_input(file_path)
        temp_output_path = f"{output_path}.video.mp4"
        temp_audio_output = f"{output_path}.audio.wav"
        cap = None
        writer = None

        stats = {
            "input_file": file_path,
            "output_file": output_path,
            "frames_total": 0,
            "frames_kept": 0,
            "frames_dropped": 0,
            "ocr_runs": 0,
            "silent_segments": 0,
            "active_segments": 0,
            "compression_ratio": 0.0,
            "audio_frames_active": 0,
            "audio_kept": False,
        }

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

            audio_signal = None
            audio_sample_rate = None
            audio_frame_rms = None
            if params["use_audio"]:
                ffmpeg_exe = self._get_ffmpeg_exe(logger)
                if ffmpeg_exe:
                    audio_signal, audio_sample_rate = self._extract_audio_signal(
                        ffmpeg_exe,
                        read_path,
                        params["audio_sample_rate"],
                        logger,
                    )
                    if audio_signal is not None and audio_sample_rate:
                        audio_frame_rms = self._build_audio_frame_rms(
                            audio_signal,
                            audio_sample_rate,
                            total_frames,
                            fps,
                            params["audio_hangover_frames"],
                        )
                        stats["audio_frames_active"] = sum(
                            1 for value in audio_frame_rms if value >= params["audio_rms_threshold"]
                        )

            writer = cv2.VideoWriter(
                temp_output_path,
                cv2.VideoWriter_fourcc(*"mp4v"),
                fps,
                (width, height),
            )
            if not writer.isOpened():
                raise RuntimeError(f"无法创建输出视频: {temp_output_path}")

            logger.info(f"开始处理视频冗余过滤: {file_path}, size={width}x{height}, fps={fps}, frames={total_frames}")

            keep_every_active = max(1, int(round(fps / max(params["active_keep_fps"], 0.05))))
            keep_every_silent = max(1, int(round(fps / params["silent_keep_fps"])))

            prev_frame_small = None
            prev_ocr_text = ""
            last_kept_frame_idx = -10**9
            last_ocr_frame_idx = -10**9
            current_state = None
            segment_start_idx = 0
            metadata_segments = []
            kept_frame_indices = []
            pending_state = None
            pending_state_count = 0
            pending_state_start_idx = None
            progress_marks = [25, 50, 75, 100]
            next_progress_mark_index = 0

            frame_idx = 0
            while True:
                if frame_idx >= total_frames:
                    break
                ret, frame = cap.read()
                if not ret:
                    break

                frame_small = self._prepare_compare_frame(frame, params)
                pixel_score = self._compute_pixel_change_score(prev_frame_small, frame_small, params)
                text_change_score = 0.0
                ran_ocr = False
                current_ocr_text = prev_ocr_text
                audio_score = audio_frame_rms[frame_idx] if audio_frame_rms is not None and frame_idx < len(audio_frame_rms) else 0.0
                audio_active = audio_score >= params["audio_rms_threshold"]

                should_run_ocr = False
                if params["use_ocr"]:
                    should_run_ocr = frame_idx == 0 or frame_idx - last_ocr_frame_idx >= params["ocr_interval_frames"]
                    if not should_run_ocr and not (params["audio_short_circuit_ocr"] and audio_active):
                        should_run_ocr = pixel_score >= (
                            params["pixel_change_threshold"] * params["ocr_pixel_trigger_ratio"]
                        )

                if should_run_ocr:
                    current_ocr_text = self._extract_frame_text(frame, params, logger)
                    text_change_score = self._compute_text_change_score(prev_ocr_text, current_ocr_text)
                    prev_ocr_text = current_ocr_text
                    last_ocr_frame_idx = frame_idx
                    stats["ocr_runs"] += 1
                    ran_ocr = True

                activity_score = self._compute_activity_score(pixel_score, text_change_score, params)
                candidate_state = self._determine_candidate_state(
                    current_state,
                    pixel_score,
                    text_change_score,
                    activity_score,
                    audio_active,
                    params,
                )

                if current_state is None:
                    current_state = candidate_state
                    segment_start_idx = frame_idx
                elif candidate_state != current_state:
                    if pending_state != candidate_state:
                        pending_state = candidate_state
                        pending_state_count = 1
                        pending_state_start_idx = frame_idx
                    else:
                        pending_state_count += 1

                    required_frames = self._get_state_confirmation_frames(candidate_state, params, fps)
                    if pending_state_count >= required_frames:
                        metadata_segments.append(
                            self._build_segment(
                                current_state,
                                segment_start_idx,
                                pending_state_start_idx - 1,
                                fps,
                                audio_frame_rms,
                                params["audio_rms_threshold"],
                            )
                        )
                        current_state = candidate_state
                        segment_start_idx = pending_state_start_idx
                        pending_state = None
                        pending_state_count = 0
                        pending_state_start_idx = None
                else:
                    pending_state = None
                    pending_state_count = 0
                    pending_state_start_idx = None

                should_keep = self._should_keep_frame(
                    frame_idx,
                    total_frames,
                    current_state,
                    last_kept_frame_idx,
                    keep_every_active,
                    keep_every_silent,
                    audio_active,
                    params,
                )

                if should_keep:
                    writer.write(frame)
                    last_kept_frame_idx = frame_idx
                    stats["frames_kept"] += 1
                    kept_frame_indices.append(frame_idx)
                else:
                    stats["frames_dropped"] += 1

                processed_frames = frame_idx + 1
                progress_percent = int((processed_frames / total_frames) * 100) if total_frames > 0 else 100
                while (
                    next_progress_mark_index < len(progress_marks)
                    and progress_percent >= progress_marks[next_progress_mark_index]
                ):
                    progress_mark = progress_marks[next_progress_mark_index]
                    logger.info(
                        f"视频冗余过滤进度: {progress_mark}%, "
                        f"frames={processed_frames}/{total_frames}, "
                        f"state={current_state}, pixel_score={pixel_score:.4f}, "
                        f"text_score={text_change_score:.4f}, audio_score={audio_score:.4f}, "
                        f"keep={should_keep}, ocr={ran_ocr}"
                    )
                    next_progress_mark_index += 1

                prev_frame_small = frame_small
                frame_idx += 1

            if current_state is not None:
                metadata_segments.append(
                    self._build_segment(
                        current_state,
                        segment_start_idx,
                        max(0, frame_idx - 1),
                        fps,
                        audio_frame_rms,
                        params["audio_rms_threshold"],
                    )
                )

            cap.release()
            cap = None
            writer.release()
            writer = None

            timeline_mapping = self._build_timeline_mapping(kept_frame_indices, fps)
            stats["silent_segments"] = sum(1 for item in metadata_segments if item["state"] == "silent")
            stats["active_segments"] = sum(1 for item in metadata_segments if item["state"] == "active")
            stats["timeline_mapping_entries"] = len(timeline_mapping)
            if stats["frames_total"] > 0:
                stats["compression_ratio"] = round(1.0 - (stats["frames_kept"] / stats["frames_total"]), 4)

            self.last_run_debug[os.path.basename(file_path)] = {
                "fps": fps,
                "frames_total": total_frames,
                "frames_kept": stats["frames_kept"],
                "frames_dropped": stats["frames_dropped"],
                "segments": metadata_segments,
                "timeline_mapping": timeline_mapping,
            }

            self._finalize_output(
                temp_output_path,
                output_path,
                read_path,
                kept_frame_indices,
                fps,
                audio_signal,
                audio_sample_rate,
                temp_audio_output,
                params,
                stats,
                logger,
            )

            self.last_run_stats[os.path.basename(file_path)] = stats
            logger.info(f"视频冗余过滤完成: {stats}")
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
            if os.path.exists(temp_audio_output):
                try:
                    os.remove(temp_audio_output)
                except OSError:
                    pass
            if os.path.exists(temp_output_path) and not os.path.exists(output_path):
                try:
                    os.remove(temp_output_path)
                except OSError:
                    pass

    @staticmethod
    def _prepare_compare_frame(frame, params):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        frame_h, frame_w = gray.shape[:2]
        target_w = min(frame_w, params["pixel_compare_max_width"])
        if target_w >= frame_w:
            return gray
        scale = target_w / float(frame_w)
        target_h = max(1, int(round(frame_h * scale)))
        return cv2.resize(gray, (target_w, target_h), interpolation=cv2.INTER_AREA)

    @staticmethod
    def _compute_pixel_change_score(prev_frame_gray, current_frame_gray, params):
        if prev_frame_gray is None:
            return 1.0

        diff = cv2.absdiff(prev_frame_gray, current_frame_gray)
        _, binary = cv2.threshold(diff, params["pixel_binary_threshold"], 255, cv2.THRESH_BINARY)
        changed_ratio = float(np.count_nonzero(binary)) / float(binary.size)
        return changed_ratio

    def _extract_frame_text(self, frame, params, logger):
        items = self._run_ocr(frame, params, logger)
        if not items:
            return ""
        items = self._merge_text_items(items, params)
        items = sorted(items, key=lambda item: (item["center_y"], item["box"][0]))
        return " ".join(item["text"] for item in items)

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

    def _run_ocr(self, frame, params, logger):
        return self._run_remote_ocr(frame, params, logger)

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

        words_block_list = (
            response_payload.get("result", {}).get("words_block_list", [])
            if isinstance(response_payload, dict)
            else []
        )

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
        max_width = params.get("ocr_max_width", width)
        if width <= max_width:
            return frame, 1.0, 1.0

        scale = max_width / float(width)
        resized = cv2.resize(frame, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)
        scale_x = width / float(resized.shape[1])
        scale_y = height / float(resized.shape[0])
        return resized, scale_x, scale_y

    @staticmethod
    def _looks_like_line(raw_line):
        if not isinstance(raw_line, (list, tuple)) or len(raw_line) < 2:
            return False
        points = raw_line[0]
        return isinstance(points, (list, tuple)) and len(points) >= 4

    @staticmethod
    def _merge_text_items(items, params):
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

    @staticmethod
    def _compute_text_change_score(prev_text, current_text):
        if not prev_text and not current_text:
            return 0.0
        if not prev_text or not current_text:
            return 1.0
        similarity = SequenceMatcher(None, prev_text, current_text).ratio()
        return 1.0 - similarity

    @staticmethod
    def _compute_activity_score(pixel_score, text_change_score, params):
        return (
            pixel_score * params["pixel_score_weight"]
            + text_change_score * params["text_score_weight"]
        )

    @staticmethod
    def _get_state_confirmation_frames(target_state, params, fps):
        if target_state == "active":
            return params["active_state_min_frames"]
        return max(
            params["silent_state_min_frames"],
            int(round(max(1.0, fps) * params["silent_state_min_duration_sec"]))
        )

    @staticmethod
    def _determine_candidate_state(current_state, pixel_score, text_change_score, activity_score, audio_active, params):
        if audio_active:
            return "active"

        pixel_active = pixel_score >= params["pixel_change_threshold"]
        text_active = text_change_score >= params["text_change_threshold"]
        if pixel_active or text_active:
            return "active"

        is_strict_silent = (
            pixel_score <= params["silent_pixel_max_threshold"]
            and text_change_score <= params["silent_text_max_threshold"]
        )

        if current_state == "active":
            return "silent" if is_strict_silent and activity_score < params["active_exit_score_threshold"] else "active"
        if not is_strict_silent:
            return "active"
        return "active" if activity_score >= params["active_enter_score_threshold"] else "silent"

    @staticmethod
    def _build_timeline_mapping(kept_frame_indices, fps):
        mapping = []
        if not kept_frame_indices:
            return mapping

        source_start = kept_frame_indices[0]
        source_prev = kept_frame_indices[0]
        output_start = 0
        output_prev = 0

        for output_idx, source_idx in enumerate(kept_frame_indices[1:], start=1):
            if source_idx == source_prev + 1:
                source_prev = source_idx
                output_prev = output_idx
                continue

            mapping.append(
                {
                    "source_start_frame": source_start,
                    "source_end_frame": source_prev,
                    "source_start_time_sec": round(source_start / fps, 3) if fps > 0 else 0.0,
                    "source_end_time_sec": round(source_prev / fps, 3) if fps > 0 else 0.0,
                    "output_start_frame": output_start,
                    "output_end_frame": output_prev,
                    "output_start_time_sec": round(output_start / fps, 3) if fps > 0 else 0.0,
                    "output_end_time_sec": round(output_prev / fps, 3) if fps > 0 else 0.0,
                }
            )
            source_start = source_idx
            source_prev = source_idx
            output_start = output_idx
            output_prev = output_idx

        mapping.append(
            {
                "source_start_frame": source_start,
                "source_end_frame": source_prev,
                "source_start_time_sec": round(source_start / fps, 3) if fps > 0 else 0.0,
                "source_end_time_sec": round(source_prev / fps, 3) if fps > 0 else 0.0,
                "output_start_frame": output_start,
                "output_end_frame": output_prev,
                "output_start_time_sec": round(output_start / fps, 3) if fps > 0 else 0.0,
                "output_end_time_sec": round(output_prev / fps, 3) if fps > 0 else 0.0,
            }
        )
        return mapping

    @staticmethod
    def _should_keep_frame(
        frame_idx,
        total_frames,
        state,
        last_kept_frame_idx,
        keep_every_active,
        keep_every_silent,
        audio_active,
        params,
    ):
        if params["always_keep_first_frame"] and frame_idx == 0:
            return True
        if params["always_keep_last_frame"] and frame_idx == total_frames - 1:
            return True

        if audio_active:
            interval = 1
        elif state == "active" and params.get("keep_all_active_frames", True):
            interval = 1
        else:
            interval = keep_every_active if state == "active" else keep_every_silent
        return frame_idx - last_kept_frame_idx >= interval

    @staticmethod
    def _build_segment(state, start_idx, end_idx, fps, audio_frame_rms, audio_threshold):
        segment = {
            "state": state,
            "start_frame": start_idx,
            "end_frame": end_idx,
            "start_time_sec": round(start_idx / fps, 3) if fps > 0 else 0.0,
            "end_time_sec": round(end_idx / fps, 3) if fps > 0 else 0.0,
            "duration_frames": max(0, end_idx - start_idx + 1),
        }
        if audio_frame_rms is not None and end_idx >= start_idx:
            values = audio_frame_rms[start_idx:end_idx + 1]
            if values:
                active_frames = sum(1 for value in values if value >= audio_threshold)
                segment["audio_max_rms"] = round(float(max(values)), 6)
                segment["audio_active_frames"] = active_frames
                segment["audio_active_ratio"] = round(active_frames / len(values), 4)
                segment["audio_detected"] = bool(active_frames > 0)
                # Keep `audio_active` aligned with the segment state for easier interpretation.
                segment["audio_active"] = (state == "active")
        return segment

    @staticmethod
    def _get_ffmpeg_exe(logger):
        ffmpeg_exe = shutil.which("ffmpeg")
        if ffmpeg_exe:
            return ffmpeg_exe
        try:
            import imageio_ffmpeg
            imageio_ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
            if imageio_ffmpeg_exe:
                return imageio_ffmpeg_exe
        except Exception as exc:
            logger.warning(f"imageio_ffmpeg 不可用: {exc}")
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
        logger.warning("未找到可用 ffmpeg")
        return None

    @staticmethod
    def _extract_audio_signal(ffmpeg_exe, video_path, target_sample_rate, logger):
        fd, temp_wav = tempfile.mkstemp(prefix="video_redundancy_audio_", suffix=".wav")
        os.close(fd)
        command = [
            ffmpeg_exe,
            "-y",
            "-i",
            video_path,
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(target_sample_rate),
            "-f",
            "wav",
            temp_wav,
        ]
        result = EnhanceVideoRedundancyOperator._run_command_capture(command)
        if result.returncode != 0:
            logger.warning(f"音频提取失败，退回纯视频判定: {result.stderr[-300:]}")
            try:
                os.remove(temp_wav)
            except OSError:
                pass
            return None, None

        try:
            with wave.open(temp_wav, "rb") as wav_file:
                sample_rate = wav_file.getframerate()
                sample_width = wav_file.getsampwidth()
                frame_count = wav_file.getnframes()
                raw = wav_file.readframes(frame_count)
        finally:
            try:
                os.remove(temp_wav)
            except OSError:
                pass

        dtype_map = {1: np.int8, 2: np.int16, 4: np.int32}
        dtype = dtype_map.get(sample_width)
        if dtype is None:
            logger.warning(f"不支持的音频采样宽度: {sample_width}")
            return None, None

        signal = np.frombuffer(raw, dtype=dtype).astype(np.float32)
        max_value = float(np.iinfo(dtype).max) or 1.0
        signal /= max_value
        return signal, sample_rate

    @staticmethod
    def _build_audio_frame_rms(audio_signal, sample_rate, total_frames, fps, hangover_frames):
        if audio_signal is None or sample_rate is None or fps <= 0:
            return None

        frame_rms = []
        for frame_idx in range(total_frames):
            start = int(round(frame_idx * sample_rate / fps))
            end = int(round((frame_idx + 1) * sample_rate / fps))
            start = max(0, min(len(audio_signal), start))
            end = max(start + 1, min(len(audio_signal), end))
            chunk = audio_signal[start:end]
            rms = float(np.sqrt(np.mean(np.square(chunk)))) if chunk.size else 0.0
            frame_rms.append(rms)

        if hangover_frames <= 0:
            return frame_rms

        smoothed = frame_rms[:]
        for idx, value in enumerate(frame_rms):
            if value <= 0:
                continue
            for offset in range(1, hangover_frames + 1):
                target_idx = idx + offset
                if target_idx >= len(smoothed):
                    break
                smoothed[target_idx] = max(smoothed[target_idx], value * 0.85)
        return smoothed

    def _finalize_output(
        self,
        temp_video_path,
        final_output_path,
        source_video_path,
        kept_frame_indices,
        fps,
        audio_signal,
        audio_sample_rate,
        temp_audio_output,
        params,
        stats,
        logger,
    ):
        ffmpeg_exe = self._get_ffmpeg_exe(logger)
        logger.info(f"视频冗余过滤导出阶段使用 ffmpeg: {ffmpeg_exe}")
        if (
            ffmpeg_exe
            and params["keep_audio"]
            and audio_signal is not None
            and audio_sample_rate is not None
            and kept_frame_indices
        ):
            self._write_kept_audio_wav(
                temp_audio_output,
                audio_signal,
                audio_sample_rate,
                kept_frame_indices,
                fps,
            )
            self._log_wav_info(temp_audio_output, logger, "视频冗余过滤临时音频")

        if ffmpeg_exe:
            export_ok = self._export_h264_with_ffmpeg(
                ffmpeg_exe,
                temp_video_path,
                temp_audio_output,
                final_output_path,
                params,
                logger,
            )
            if export_ok:
                stats["audio_kept"] = bool(
                    params["keep_audio"]
                    and os.path.exists(temp_audio_output)
                    and os.path.getsize(temp_audio_output) > 0
                )
                self._log_media_info(ffmpeg_exe, final_output_path, logger, "视频冗余过滤最终输出")
                return

        if os.path.exists(final_output_path):
            os.remove(final_output_path)
        os.replace(temp_video_path, final_output_path)
        logger.warning("当前环境未完成 H.264 导出，退回原始 mp4v 输出，前端兼容性可能较差")

    @staticmethod
    def _write_kept_audio_wav(output_wav_path, audio_signal, sample_rate, kept_frame_indices, fps):
        segments = []
        total_len = len(audio_signal)
        for start_frame, end_frame in EnhanceVideoRedundancyOperator._build_kept_frame_ranges(kept_frame_indices):
            start = int(round(start_frame * sample_rate / fps))
            end = int(round((end_frame + 1) * sample_rate / fps))
            start = max(0, min(total_len, start))
            end = max(start + 1, min(total_len, end))
            segments.append(audio_signal[start:end])

        merged = np.concatenate(segments) if segments else np.zeros(1, dtype=np.float32)
        merged = EnhanceVideoRedundancyOperator._resample_audio_signal(merged, sample_rate, 44100)
        merged = np.clip(merged, -1.0, 1.0)
        stereo = np.stack([merged, merged], axis=1)
        pcm = (stereo * 32767.0).astype(np.int16)

        with wave.open(output_wav_path, "wb") as wav_file:
            wav_file.setnchannels(2)
            wav_file.setsampwidth(2)
            wav_file.setframerate(44100)
            wav_file.writeframes(pcm.tobytes())

    @staticmethod
    def _build_kept_frame_ranges(kept_frame_indices):
        if not kept_frame_indices:
            return []

        ranges = []
        start = kept_frame_indices[0]
        prev = kept_frame_indices[0]
        for frame_idx in kept_frame_indices[1:]:
            if frame_idx == prev + 1:
                prev = frame_idx
                continue
            ranges.append((start, prev))
            start = frame_idx
            prev = frame_idx
        ranges.append((start, prev))
        return ranges

    @staticmethod
    def _resample_audio_signal(signal, source_rate, target_rate):
        if signal.size == 0:
            return signal.astype(np.float32)
        if source_rate == target_rate:
            return signal.astype(np.float32)

        duration = len(signal) / float(source_rate)
        target_length = max(1, int(round(duration * target_rate)))
        source_x = np.linspace(0.0, duration, num=len(signal), endpoint=False, dtype=np.float64)
        target_x = np.linspace(0.0, duration, num=target_length, endpoint=False, dtype=np.float64)
        resampled = np.interp(target_x, source_x, signal).astype(np.float32)
        return resampled

    @staticmethod
    def _export_h264_with_ffmpeg(ffmpeg_exe, temp_video_path, temp_audio_output, final_output_path, params, logger):
        if params["keep_audio"] and os.path.exists(temp_audio_output) and os.path.getsize(temp_audio_output) > 0:
            command = [
                ffmpeg_exe,
                "-y",
                "-i",
                temp_video_path,
                "-i",
                temp_audio_output,
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-c:v",
                "libx264",
                "-c:a",
                "aac",
                "-ar",
                "44100",
                "-ac",
                "2",
                "-b:a",
                "128k",
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
                temp_video_path,
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                final_output_path,
            ]

        logger.info(f"视频冗余过滤导出命令: {' '.join(str(item) for item in command)}")
        result = EnhanceVideoRedundancyOperator._run_command_capture(command)
        if result.returncode == 0:
            try:
                os.remove(temp_video_path)
            except OSError:
                pass
            logger.info("视频冗余过滤 H.264 视频导出完成")
            return True
        logger.warning(f"视频冗余过滤 H.264 视频导出失败: {result.stderr[-300:]}")
        return False

    @staticmethod
    def _log_wav_info(wav_path, logger, label):
        if not os.path.exists(wav_path):
            logger.warning(f"{label}不存在: {wav_path}")
            return
        try:
            with wave.open(wav_path, "rb") as wav_file:
                channels = wav_file.getnchannels()
                sample_width = wav_file.getsampwidth()
                sample_rate = wav_file.getframerate()
                frame_count = wav_file.getnframes()
            duration_sec = frame_count / float(sample_rate) if sample_rate > 0 else 0.0
            logger.info(
                f"{label}信息: path={wav_path}, size={os.path.getsize(wav_path)}, "
                f"channels={channels}, sample_width={sample_width}, sample_rate={sample_rate}, "
                f"frames={frame_count}, duration_sec={duration_sec:.3f}"
            )
        except Exception as exc:
            logger.warning(f"{label}信息读取失败: {exc}")

    @staticmethod
    def _log_media_info(ffmpeg_exe, media_path, logger, label):
        if not ffmpeg_exe or not os.path.exists(media_path):
            logger.warning(f"{label}探测跳过: ffmpeg={ffmpeg_exe}, exists={os.path.exists(media_path)}")
            return
        command = [ffmpeg_exe, "-i", media_path]
        result = EnhanceVideoRedundancyOperator._run_command_capture(command)
        lines = []
        for line in result.stderr.splitlines():
            if "Duration:" in line or "Stream #" in line:
                lines.append(line.strip())
        if lines:
            logger.info(f"{label}流信息:\n" + "\n".join(lines))
        else:
            logger.warning(f"{label}流信息探测未提取到关键行")

    @staticmethod
    def _run_command_capture(command):
        result = subprocess.run(command, capture_output=True)
        result.stdout = EnhanceVideoRedundancyOperator._decode_subprocess_output(result.stdout)
        result.stderr = EnhanceVideoRedundancyOperator._decode_subprocess_output(result.stderr)
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

    @classmethod
    def _is_video_file(cls, file_name):
        return file_name.lower().endswith(cls.VIDEO_EXTENSIONS)

    @classmethod
    def _is_known_unsupported_video_file(cls, file_name):
        return file_name.lower().endswith(cls.UNSUPPORTED_VIDEO_EXTENSIONS)
