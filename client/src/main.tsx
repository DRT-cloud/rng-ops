// MUST be first — pdfjs-dist 5.x calls Uint8Array.prototype.toHex which is
// missing in the Chromium that ships with Electron < 31.4.
import "./polyfills";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerMatchServiceWorker } from "./match/lib/sw";

if (!window.location.hash) {
  window.location.hash = "#/";
}

registerMatchServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
