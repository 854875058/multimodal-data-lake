# local-file-to-lance Agent Notes

This file stores project-level rules that should be read first in new sessions.

## Session Handoff

- If a current-session handoff file exists, read `SESSION_HANDOFF.md` before making assumptions about the latest active work.

## Startup Rules

- Start the backend from the repo root:
  - `python backend/main.py`
  - Working directory must be the repository root (`<repo-root>`)
- Do not use `python main.py` from inside `backend/` as the main startup check.
- Reason:
  - `backend/main.py` writes to the repo-root `app.log`
  - it also depends on `ROOT_DIR = Path(__file__).parent.parent`
  - starting from the wrong working directory or a restricted write context can produce misleading `PermissionError` results

## Validation Order

- Run lightweight checks before starting services:
  - Python changes: `python -m py_compile ...`
  - Frontend changes: `npm run build`
  - If ops scripts changed: `python deploy.py env` and `python deploy.py status`
- Backend startup is only considered successful when all of these are true:
  - `http://127.0.0.1:8090/api/health` returns 200
  - `http://127.0.0.1:8090/` serves the frontend index
  - if workbench code changed, also check `http://127.0.0.1:8090/api/workbench/settings`

## Git Workflow

- After a completed, user-requested implementation round that has passed the relevant lightweight validation, automatically create a git commit unless the user explicitly says not to commit.
- If the user explicitly asks to commit all current changes, include the full current worktree instead of splitting only agent-authored files.

## Known Environment Pitfalls

- In this environment, `deploy.py start --backend` or other background-start commands can time out or lose the child process when started from a restricted session.
- For manual user testing, prefer a detached background start outside the restricted session, then verify port `8090` and `/api/health` immediately.
- `vite dev` can fail here with `spawn EPERM` because `esbuild` cannot spawn its child process in the current environment.
- When that happens, do not treat it as a frontend code failure if `npm run build` is already passing.
- For manual testing, prefer the production build served by backend `8090`.
- If the backend starts fine in the foreground but not in the background, debug the launch method first, not the business code first.

## Incident Record 2026-03-12

- Initial mistake:
  - backend startup was first checked from an unsuitable working directory
  - this caused a misleading `app.log` permission diagnosis
- Second mistake:
  - backend was first started in a restricted background mode
  - the process did not stay alive long enough for health checks
- Confirmed working manual test entry points:
  - `http://127.0.0.1:8090`
  - `http://127.0.0.1:8090/api/health`
  - `http://127.0.0.1:8090/api/workbench/settings`
