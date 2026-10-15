import React from "react";
import { createRoot } from "react-dom/client";
import { ReportDesigner } from "./ReportDesigner.jsx";
import "./designer.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ReportDesigner />
  </React.StrictMode>,
);
