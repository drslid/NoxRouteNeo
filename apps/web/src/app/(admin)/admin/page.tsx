import type { Metadata } from "next";

import { AdminDashboardLive } from "@/components/dashboard/admin-dashboard-live";
import { getAdminDashboard } from "@/data/dashboard";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  return <AdminDashboardLive initialData={await getAdminDashboard()} />;
}
