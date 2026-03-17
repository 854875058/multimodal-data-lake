# -*- coding: utf-8 -*-
"""Tests for agent git commit helper."""

import shutil
import subprocess
import sys
import uuid
from contextlib import contextmanager
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))
TEST_TMP_ROOT = ROOT_DIR / '.tmp' / 'pytest-git-ops'
TEST_TMP_ROOT.mkdir(parents=True, exist_ok=True)


@contextmanager
def local_repo_dir():
    repo = TEST_TMP_ROOT / f'case-{uuid.uuid4().hex}'
    if repo.exists():
        shutil.rmtree(repo, ignore_errors=True)
    repo.mkdir(parents=True, exist_ok=True)
    try:
        yield repo
    finally:
        shutil.rmtree(repo, ignore_errors=True)


def run(command, cwd: Path):
    subprocess.run(command, cwd=str(cwd), check=True, capture_output=True, text=False)


def test_commit_agent_changes_creates_real_commit():
    from agents.git_ops import commit_agent_changes

    with local_repo_dir() as repo:
        run(['git', 'init'], repo)
        run(['git', 'config', 'user.name', 'Agent Team'], repo)
        run(['git', 'config', 'user.email', 'agent@example.com'], repo)

        file_path = repo / 'README.md'
        file_path.write_text('hello\n', encoding='utf-8')
        run(['git', 'add', 'README.md'], repo)
        run(['git', 'commit', '-m', 'init'], repo)

        file_path.write_text('hello world\n', encoding='utf-8')
        commit_sha = commit_agent_changes(repo, [str(file_path)], 'agent: update readme')

        assert commit_sha
        log = subprocess.run(['git', 'log', '-1', '--pretty=%s'], cwd=str(repo), check=True, capture_output=True, text=False)
        assert log.stdout.decode('utf-8', errors='replace').strip() == 'agent: update readme'
