// RNG Ops — Electron main process.
// Spawns the bundled Node server, waits for it to be ready, then opens a
// BrowserWindow pointing at it. Stores the SQLite database in the OS user-data
// folder so data persists across app updates.

const { app, BrowserWindow, Menu, shell, dialog, clipboard } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const http = require("node:http");

const PORT = 5123; // non-default to avoid clashes with other dev servers
const isDev = !app.isPackaged;

// ── Paths ──────────────────────────────────────────────────────────────────
// When packaged, resources live under process.resourcesPath/app.asar.unpacked.
// We ship the server as dist/index.cjs alongside dist/public (static assets).
function resolveResource(rel) {
  if (isDev) return path.join(__dirname, "..", rel);
  // When using asar with extraResources, files sit next to the asar.
  return path.join(process.resourcesPath, rel);
}

const SERVER_ENTRY = resolveResource(path.join("dist", "index.cjs"));
const USER_DATA = app.getPath("userData");
const DB_PATH = path.join(USER_DATA, "rng-ops.db");

if (!fs.existsSync(USER_DATA)) fs.mkdirSync(USER_DATA, { recursive: true });

// ── Helpers ────────────────────────────────────────────────────────────────
function waitForPort(port, host = "127.0.0.1", timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.createConnection({ port, host }, () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Server did not start on :${port}`));
        } else {
          setTimeout(tryOnce, 200);
        }
      });
    };
    tryOnce();
  });
}

function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return null;
}

function buildMenu(win) {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Show LAN URL for phones/tablets…",
          click: () => {
            const ip = getLanIp();
            const url = ip ? `http://${ip}:${PORT}` : "no network connection";
            dialog.showMessageBox(win, {
              type: "info",
              title: "Connect phones and tablets",
              message: "Point other devices to this URL:",
              detail: url +
                "\n\nMake sure every device is on the same Wi-Fi network as this computer.",
              buttons: ["Copy URL", "Close"],
              defaultId: 0,
            }).then(({ response }) => {
              if (response === 0 && ip) clipboard.writeText(url);
            });
          },
        },
        {
          label: "Open data folder…",
          click: () => shell.openPath(USER_DATA),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About RNG Ops",
          click: () => dialog.showMessageBox(win, {
            type: "info",
            title: "About RNG Ops",
            message: "RNG Ops",
            detail: `Version ${app.getVersion()}\nBiathlon range operations — local desktop build.\nData: ${DB_PATH}`,
          }),
        },
        {
          label: "Project on GitHub",
          click: () => shell.openExternal("https://github.com/DRT-cloud/rng-ops"),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Server lifecycle ───────────────────────────────────────────────────────
let serverProcess = null;

function startServer() {
  if (!fs.existsSync(SERVER_ENTRY)) {
    dialog.showErrorBox(
      "RNG Ops — build missing",
      `Could not find ${SERVER_ENTRY}.\n\nRun "npm run build" before launching in dev.`,
    );
    app.quit();
    return Promise.reject(new Error("missing server bundle"));
  }

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    DATABASE_PATH: DB_PATH,
    // Critical: tell the packaged Electron binary to behave as plain Node.
    // Without this, spawn(process.execPath, ...) launches another GUI process
    // and the bundled server never runs.
    ELECTRON_RUN_AS_NODE: "1",
  };

  // Persist server output to a log file in user-data so failures are diagnosable.
  const LOG_PATH = path.join(USER_DATA, "server.log");
  try { fs.writeFileSync(LOG_PATH, `--- ${new Date().toISOString()} starting server ---\n`); } catch {}
  const logStream = fs.createWriteStream(LOG_PATH, { flags: "a" });
  let lastOutput = "";
  const captureOutput = (b) => {
    const s = b.toString();
    lastOutput = (lastOutput + s).slice(-4000);
    return s;
  };

  serverProcess = spawn(process.execPath, [SERVER_ENTRY], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  serverProcess.stdout.on("data", (b) => { const s = captureOutput(b); logStream.write(s); process.stdout.write(`[srv] ${s}`); });
  serverProcess.stderr.on("data", (b) => { const s = captureOutput(b); logStream.write(s); process.stderr.write(`[srv] ${s}`); });
  serverProcess.on("exit", (code) => {
    logStream.write(`\n[srv] exited (${code})\n`);
    console.log(`[srv] exited (${code})`);
    serverProcess = null;
  });

  serverProcess.lastOutput = () => lastOutput;
  serverProcess.logPath = LOG_PATH;

  return waitForPort(PORT).catch((err) => {
    const tail = lastOutput || "(no server output captured)";
    err.message = `${err.message}\n\nServer log tail:\n${tail}\n\nFull log: ${LOG_PATH}`;
    throw err;
  });
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    try { serverProcess.kill(); } catch {}
  }
}

// ── Window ────────────────────────────────────────────────────────────────
let mainWindow = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#F7F6F2",
    title: "RNG Ops",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  buildMenu(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  try {
    await startServer();
    await mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  } catch (err) {
    dialog.showErrorBox("RNG Ops — failed to start", String(err?.message || err));
    app.quit();
  }
}

// Prevent multiple copies of the app running simultaneously.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on("window-all-closed", () => {
    stopServer();
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", stopServer);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
