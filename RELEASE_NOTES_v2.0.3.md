# RNG Ops v2.0.3

Hotfix release. v2.0.2 fixed the `dotenv` issue, but the bundled server then crashed on the next runtime require:

```
Error: Cannot find module 'better-sqlite3'
```

`better-sqlite3` is a native C++ addon (`.node` binary). It cannot be bundled by esbuild — the binary file must physically exist on disk. The previous packaging config did not include `node_modules/better-sqlite3` in the app, so `require("better-sqlite3")` failed with `MODULE_NOT_FOUND`.

## Fix

`package.json` `build` config:

- Add `node_modules/better-sqlite3/**/*` to `files` so the module ships with the app.
- Add `node_modules/bindings/**/*` and `node_modules/file-uri-to-path/**/*` (transitive deps `better-sqlite3` uses to locate its native binary).
- Add `asarUnpack: ["node_modules/better-sqlite3/**/*"]` so the `.node` binary is extracted to a real path on disk where `dlopen` can load it (native addons cannot be loaded from inside an asar archive).

The native binary itself is rebuilt against Electron's Node ABI by `@electron/rebuild` during the `electron-builder` step in CI — that part was already working.

## Verified diagnosis

The new logging added in v2.0.1 made this trivial to find: `%APPDATA%\RNG Ops\server.log` showed the exact `MODULE_NOT_FOUND` error and the require stack.

## Audit of other runtime requires

`grep` of the production bundle confirms `better-sqlite3` is the **only** non-builtin module that remains as a runtime require. `bufferutil` / `utf-8-validate` (transitive optional deps of `ws`) are not referenced. All other runtime deps (express, drizzle-orm, dotenv, etc.) are inlined into `dist/index.cjs` by esbuild. So no further missing-module errors are expected.
