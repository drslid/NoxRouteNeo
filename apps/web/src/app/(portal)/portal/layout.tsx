import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/session";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireUser();

  return (
    <AppShell
      role="user"
      user={{
        name: session.user.name,
        username: session.user.username,
      }}
    >
      {children}
    </AppShell>
  );
}
