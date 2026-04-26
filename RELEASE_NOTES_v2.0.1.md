# RNG Ops v2.0.1

Hotfix release. v2.0.0 failed to start on Windows with the dialog "Server did not start on :5123".

## Fix

The Electron main process spawned the bundled server using `process.execPath` (the packaged Electron binary) without the `ELECTRON_RUN_AS_NODE=1` environment variable. As a result, a second GUI process was launched instead of the Express server, port 5123 never opened, and the 20-second readiness check timed out.

- `electron/main.cjs`: set `ELECTRON_RUN_AS_NODE=1` when spawning `dist/index.cjs`.
- `electron/main.cjs`: write server stdout/stderr to `<userData>/server.log` and surface the last 4 KB of output in the failure dialog so any future startup error is immediately diagnosable.
- `electron/main.cjs`: GitHub link in Help menu now points to `DRT-cloud/rng-ops`.

If you previously installed v2.0.0 and saw the error dialog, install v2.0.1 over the top — your data folder is unaffected.
