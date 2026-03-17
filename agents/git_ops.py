# -*- coding: utf-8 -*-
"""Git helpers for agent-authored commits without relying on interactive shell hooks."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Iterable, Optional


class GitCommitError(RuntimeError):
    """Raised when the agent cannot create a git commit."""


def _git_binary() -> str:
    for candidate in (
        shutil.which('git'),
        r'C:\Program Files\Git\cmd\git.exe',
        r'C:\Program Files\Git\bin\git.exe',
    ):
        if candidate and Path(candidate).exists():
            return candidate
    raise GitCommitError('未找到可用的 git 可执行文件。')


def _run_git(project_root: Path, args: list[str], *, env: Optional[dict[str, str]] = None, input_text: Optional[str] = None) -> str:
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    proc = subprocess.run(
        [_git_binary(), *args],
        cwd=str(project_root),
        env=merged_env,
        input=input_text,
        capture_output=True,
        text=True,
        encoding='utf-8',
        errors='replace',
        timeout=120,
    )
    if proc.returncode != 0:
        raise GitCommitError(proc.stderr.strip() or proc.stdout.strip() or f'git {" ".join(args)} 执行失败')
    return proc.stdout.strip()


def _normalize_paths(project_root: Path, paths: Iterable[str]) -> list[str]:
    normalized: list[str] = []
    seen = set()
    for item in paths:
        if not item:
            continue
        path = Path(item)
        rel_path = path
        if path.is_absolute():
            try:
                rel_path = path.resolve().relative_to(project_root.resolve())
            except ValueError:
                continue
        rel_text = str(rel_path).replace('\\', '/')
        if rel_text in seen:
            continue
        seen.add(rel_text)
        normalized.append(rel_text)
    return normalized


def commit_agent_changes(project_root: Path, paths: Iterable[str], message: str) -> Optional[str]:
    """Commit only the specified paths via a temporary git index."""
    project_root = Path(project_root).resolve()
    candidate_paths = _normalize_paths(project_root, paths)
    if not candidate_paths:
        return None

    with tempfile.NamedTemporaryFile(prefix='agent-index-', delete=False) as temp_index:
        temp_index_path = Path(temp_index.name)

    try:
        env = {'GIT_INDEX_FILE': str(temp_index_path)}
        try:
            _run_git(project_root, ['read-tree', 'HEAD'], env=env)
        except GitCommitError:
            # Empty repository fallback is acceptable.
            pass

        _run_git(project_root, ['add', '--', *candidate_paths], env=env)
        staged = _run_git(project_root, ['diff', '--cached', '--name-only', '--', *candidate_paths], env=env)
        if not staged.strip():
            return None

        tree = _run_git(project_root, ['write-tree'], env=env)
        parent = None
        try:
            parent = _run_git(project_root, ['rev-parse', 'HEAD'])
        except GitCommitError:
            parent = None

        commit_args = ['commit-tree', tree]
        if parent:
            commit_args.extend(['-p', parent])
        commit_sha = _run_git(project_root, commit_args, env=env, input_text=message)

        try:
            branch = _run_git(project_root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
            ref_name = f'refs/heads/{branch}'
        except GitCommitError:
            ref_name = 'HEAD'

        update_args = ['update-ref', ref_name, commit_sha]
        if parent:
            update_args.append(parent)
        _run_git(project_root, update_args)
        return commit_sha
    finally:
        try:
            temp_index_path.unlink(missing_ok=True)
        except Exception:
            pass
