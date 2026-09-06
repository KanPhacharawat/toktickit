import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import Lab2App from "./lab2/Lab2App.js";

// Lab 2 replaces the Lab 1 system-check screen as the application entry point.
// The Lab 1 component stays in src/App.tsx and keeps its own tests.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Lab2App />
  </React.StrictMode>
);
