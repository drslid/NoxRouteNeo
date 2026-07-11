import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/session";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, role } = await requireAdmin();

  return (
    <AppShell
      role={role}
      user={{
        name: session.user.name,
        username: session.user.username,
      }}
    >
      {children}
    </AppShell>
  );
}
