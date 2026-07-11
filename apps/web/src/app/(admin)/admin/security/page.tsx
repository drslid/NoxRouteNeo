import type { Metadata } from "next";

import { SecurityPageContent } from "@/components/security/security-page-content";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Security" };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const { session } = await requireAdmin();
  return (
    <SecurityPageContent
      userId={session.user.id}
      twoFactorEnabled={Boolean(session.user.twoFactorEnabled)}
    />
  );
}
