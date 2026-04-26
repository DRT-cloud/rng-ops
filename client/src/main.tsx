import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerMatchServiceWorker } from "./match/lib/sw";

if (!window.location.hash) {
  window.location.hash = "#/";
}

registerMatchServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
