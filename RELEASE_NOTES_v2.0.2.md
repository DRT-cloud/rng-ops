# RNG Ops v2.0.2

Hotfix release. v2.0.1 fixed the Electron spawn issue but the bundled server then crashed with `Error: Cannot find module 'dotenv/config'` because `dotenv` was marked external by the esbuild bundler and `node_modules` is not shipped in the asar.

## Fix

- `script/build.ts`: add `dotenv` to the bundle allowlist so it is inlined into `dist/index.cjs`.
- `server/index.ts`: wrap `require('dotenv/config')` in `try/catch` — the env-file loader is only useful in development; in packaged Electron the main process sets env vars directly.
- `package.json`: bump to 2.0.2.

If you previously installed v2.0.1 and saw the dialog "Server did not start on :5123" with a `MODULE_NOT_FOUND` message in `server.log`, install v2.0.2 over the top — your data is preserved.
