import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

type RouterContext = {
  session: { user: { id: string; email: string; name: string } } | null;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});
