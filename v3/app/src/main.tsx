import React from "react";
import ReactDOM from "react-dom/client";
import "@theme/fonts.css";
import "@theme/tokens.css";
import "./styles.css";
import App from "./App";
import { register as registerServiceWorker } from "@/lib/sw-register";
import * as rngdb from "@/lib/idb";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

registerServiceWorker();

// HARD_GATE_REMOVE_BEFORE_PHASE_3: window.__rngdb__ exposure
// PHASE 1 ONLY — IDB API exposed on window for DevTools console verification.
// Tracked as a hard gate in TodoWrite: "Remove window.__rngdb__ exposure
// before Phase 3 real-route migration". Do NOT ship Phase 3 with this still
// present — it's debug surface in production binaries.
// Phase 3 entry greps for the token above and must find zero matches before
// any real-screen commits land. The token appears only on the marker line
// immediately preceding this block, nowhere else in the codebase.
(window as Window & { __rngdb__?: typeof rngdb }).__rngdb__ = rngdb;
