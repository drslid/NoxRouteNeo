import type { Metadata } from "next";

import { PortalDashboardLive } from "@/components/dashboard/portal-dashboard-live";
import { getPortalDashboard } from "@/data/portal";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "My VPN" };
export const dynamic = "force-dynamic";

export default async function PortalDashboardPage() {
  const session = await requireUser();
  return (
    <PortalDashboardLive
      initialData={await getPortalDashboard(session.user.id)}
      name={session.user.name}
    />
  );
}
