import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from env_loader import load_local_env_files


def test_load_local_env_files_reads_dotenv_and_preserves_existing_env(monkeypatch, tmp_path):
    dotenv_path = tmp_path / ".env"
    dotenv_path.write_text(
        "\n".join(
            [
                "TEST_ENV_LOADER_ALPHA=from-dotenv",
                "TEST_ENV_LOADER_BETA='quoted value'",
                "export TEST_ENV_LOADER_GAMMA=from-export",
            ]
        ),
        encoding="utf-8",
    )

    monkeypatch.delenv("TEST_ENV_LOADER_ALPHA", raising=False)
    monkeypatch.setenv("TEST_ENV_LOADER_BETA", "from-process-env")
    monkeypatch.delenv("TEST_ENV_LOADER_GAMMA", raising=False)

    loaded_files = load_local_env_files(tmp_path)

    assert dotenv_path.resolve() in loaded_files
    assert os.environ["TEST_ENV_LOADER_ALPHA"] == "from-dotenv"
    assert os.environ["TEST_ENV_LOADER_BETA"] == "from-process-env"
    assert os.environ["TEST_ENV_LOADER_GAMMA"] == "from-export"
