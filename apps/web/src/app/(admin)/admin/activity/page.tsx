import type { Metadata } from "next";

import { ActivityLiveTable } from "@/components/dashboard/activity-live-table";
import { getAdminActivity } from "@/data/activity";

export const metadata: Metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  return <ActivityLiveTable initialData={await getAdminActivity()} />;
}
