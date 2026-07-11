import type { Metadata } from "next";

import { SecurityPageContent } from "@/components/security/security-page-content";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Security" };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const session = await requireUser();
  return (
    <SecurityPageContent
      userId={session.user.id}
      twoFactorEnabled={Boolean(session.user.twoFactorEnabled)}
    />
  );
}
