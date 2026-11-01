import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
const tree = <App />;

// StrictMode solo en dev (doble montaje ralentiza el arranque en producción).
root.render(import.meta.env.DEV ? <React.StrictMode>{tree}</React.StrictMode> : tree);
