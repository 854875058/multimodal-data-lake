from __future__ import annotations

import os
from pathlib import Path


_DEFAULT_ENV_FILES = (".env", ".env.local")
_LOADED_ENV_FILES: set[Path] = set()


def _parse_env_line(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None
    if stripped.startswith("export "):
        stripped = stripped[len("export ") :].lstrip()
    if "=" not in stripped:
        return None

    key, value = stripped.split("=", 1)
    key = key.strip()
    if not key or any(char.isspace() for char in key):
        return None

    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]
    elif " #" in value:
        value = value.split(" #", 1)[0].rstrip()

    return key, value


def load_local_env_files(base_dir: str | Path | None = None) -> list[Path]:
    root = Path(base_dir) if base_dir is not None else Path(__file__).resolve().parent
    loaded_files: list[Path] = []

    for env_name in _DEFAULT_ENV_FILES:
        env_path = (root / env_name).resolve()
        if env_path in _LOADED_ENV_FILES or not env_path.is_file():
            continue

        with env_path.open("r", encoding="utf-8") as handle:
            for raw_line in handle:
                parsed = _parse_env_line(raw_line)
                if parsed is None:
                    continue
                key, value = parsed
                os.environ.setdefault(key, value)

        _LOADED_ENV_FILES.add(env_path)
        loaded_files.append(env_path)

    return loaded_files
