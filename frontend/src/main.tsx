import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "./router";
import { authClient } from "./lib/auth-client";
import "./index.css";

const queryClient = new QueryClient();

async function main() {
  const { data: session } = await authClient.getSession();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} context={{ session }} />
      </QueryClientProvider>
    </React.StrictMode>
  );
}

main();
