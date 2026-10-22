import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceProvider } from "./app/Workspace";
import { App } from "./app/App";
import { AppearanceProvider } from "./app/Appearance";
import { MotionConfig } from "framer-motion";
import "./app/styles.css";
const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, refetchOnWindowFocus: false },
  },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppearanceProvider>
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={client}>
          <BrowserRouter>
            <WorkspaceProvider>
              <App />
            </WorkspaceProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </MotionConfig>
    </AppearanceProvider>
  </React.StrictMode>,
);
