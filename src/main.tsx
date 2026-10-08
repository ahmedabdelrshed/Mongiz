import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceProvider } from "./app/Workspace";
import { App } from "./app/App";
import "./app/styles.css";
const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, refetchOnWindowFocus: false },
  },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <HashRouter>
        <WorkspaceProvider>
          <App />
        </WorkspaceProvider>
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
