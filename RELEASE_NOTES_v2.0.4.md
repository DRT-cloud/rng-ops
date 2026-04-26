# RNG Ops v2.0.4

Hotfix release. v2.0.3 shipped `better-sqlite3` into the installer, but it landed in `resources/app.asar.unpacked/node_modules/` — a path that is invisible to the Node module resolver when the server runs from `resources/dist/index.cjs` (outside the asar).

Node's module resolution walks **upward** from the require'r looking for `node_modules`. From `resources/dist/`, it searches `resources/dist/node_modules`, `resources/node_modules`, and `resources/`. The asar's special `app.asar.unpacked` redirection only applies to code running **inside** the asar — and our server is shipped via `extraResources`, outside the asar.

## Fix

`package.json` `build` config: ship `better-sqlite3` (and its transitive deps `bindings`, `file-uri-to-path`) via `extraResources` to `resources/node_modules/`, where the bundled server can actually find them via standard Node resolution.

Removed the `asar`/`asarUnpack`/`files` entries for these modules — they were placing the files in the wrong tree.

## Resulting on-disk layout

```
C:\Program Files\RNG Ops\
  resources\
    app.asar                          (Electron main process code)
    dist\
      index.cjs                       (server entry — runs from here)
    node_modules\                     (NEW — visible to dist/index.cjs)
      better-sqlite3\
        build\Release\better_sqlite3.node
      bindings\
      file-uri-to-path\
```

## Verification before publishing

This time the fix was simulated end-to-end on Linux **before** pushing the tag:

1. The packaged layout was reproduced in a sandbox folder (`resources/dist`, `resources/node_modules/...`).
2. `require("better-sqlite3")` resolved correctly.
3. An in-memory SQLite database round-trip succeeded.
4. The actual bundled `dist/index.cjs` was started in this layout, opened a port, and returned HTTP 200.

If v2.0.4 fails to start, the cause will not be missing `better-sqlite3`.
