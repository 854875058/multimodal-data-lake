# Session Handoff

Last updated: 2026-03-12

## Current Goal

- Continue work on the current React + FastAPI app in this repository.
- The active frontend entry is the Vite + React app rooted at `frontend/src/main.jsx` and `frontend/src/App.jsx`.
- The user may restart the environment and switch to a newly installed Codex.
- New sessions should read this file before making assumptions about the latest active work.

## What Was Done In This Session

- Reviewed git history and confirmed the recent committed direction:
  - Vue 3 + FastAPI migration
  - deploy/start script consolidation
  - upload/static-file fixes
- Validated the recent code state:
  - Python syntax checks passed for the touched backend/workbench files
  - frontend production build passed with `npm run build`
  - backend health endpoint worked after restart
- Investigated an earlier startup mistake:
  - backend startup was first tested from the wrong working directory
  - that produced a misleading `app.log` permission diagnosis
  - correct backend startup check is from repo root with `python backend/main.py`
- Confirmed environment-specific startup behavior:
  - background starts from a restricted session can fail or lose the child process
  - `vite dev` can fail here with `spawn EPERM`
  - production build served by backend `8090` is the reliable manual test path

## Important Functional Change Made

- Restored SFTP ingest support into the current React + FastAPI workbench.
- This is not a revival of the old NiceGUI page.
- SFTP is now integrated into the current `IngestionWorkbenchPage` flow alongside S3.

## Files Changed For SFTP Restore

- `ingestion_workbench.py`
- `backend/api/workbench.py`
- `frontend/src/pages/IngestionWorkbenchPage.jsx`
- `frontend/src/assets/styles.css`

## SFTP Restore Details

- Workbench now supports two source types:
  - `s3`
  - `sftp`
- Backend workbench payload now includes:
  - `source_type`
  - `sftp_host`
  - `sftp_port`
  - `sftp_user`
  - `sftp_password`
  - `sftp_path`
- The current workbench flow now supports SFTP for:
  - test connection
  - scan source
  - start batch ingest job
  - reuse existing job configuration
  - display source details in job detail panels
- Current SFTP scan behavior matches the old simple behavior:
  - scan direct child files of the configured remote path
  - not recursive

## Evidence Found During Investigation

- Old NiceGUI app still had SFTP UI and called `sftp_task(...)`.
- Old SFTP ETL logic was still present in `etl.py`.
- Current FastAPI app and React workbench had moved toward S3 and had lost the SFTP UI/API path.
- SFTP was therefore not fully deleted; it had been left behind during migration.

## Verification Done After The Change

- `python -m py_compile ingestion_workbench.py backend/api/workbench.py backend/main.py`
- `cd frontend && npm run build`
- Restarted backend and verified:
  - `http://127.0.0.1:8090/api/health`
  - `http://127.0.0.1:8090/api/workbench/settings`
  - `http://127.0.0.1:8090/`
- Confirmed `paramiko` import works in the current environment.
- Revalidated again later on `2026-03-12`:
  - `http://127.0.0.1:8090/api/health` returned `200`
  - `http://127.0.0.1:8090/api/workbench/settings` returned `200`
  - `http://127.0.0.1:8090/` returned `200` and served the current Vite build assets
  - `frontend` production build still passed with `npm run build`

## Current Runtime State

- Backend was running when rechecked on `2026-03-12` on port `8090`.
- A checked working backend health URL is:
  - `http://127.0.0.1:8090/api/health`
- A checked working app URL is:
  - `http://127.0.0.1:8090`
- A checked working workbench settings URL is:
  - `http://127.0.0.1:8090/api/workbench/settings`
- If the environment was restarted after this handoff, do not assume the process is still alive. Re-check the port and health endpoint.

## Reference Docs Check

- The `reference docs` folder was reviewed.
- The reference material mainly points toward:
  - SeaweedFS / S3
  - Lance
  - Ray
  - Doris
  - platform-style workbench capabilities
- Those docs support why the newer workbench evolved toward S3-centric ingest.
- They do not appear to make SFTP the main strategic direction.
- Conclusion:
  - S3/SeaweedFS is the platform direction from the reference material
  - SFTP is still a valid practical ingest path and has now been restored into the current app

## Known Caveats

- The working tree is not clean. Do not assume only the files above are changed.
- Do not revert unrelated user changes.
- Use repo-root backend startup, not `python main.py` inside `backend/`.
- Prefer backend-served frontend over `vite dev` for manual verification in this environment.

## Good Next Actions For The Next Session

- Ask the user to test SFTP manually in the workbench UI.
- If SFTP fails against a real host, inspect:
  - `backend-live.out.log`
  - `backend-live.err.log`
  - task logs in the workbench job detail
- If needed later, add recursive SFTP directory scanning.
