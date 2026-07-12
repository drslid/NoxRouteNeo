"use client";

import { authClient } from "@noxroute/auth/client";
import type { AppRole } from "@noxroute/auth/permissions";
import { Badge, Button, NoxRouteLogo, cn } from "@noxroute/ui";
import {
  Activity,
  Gauge,
  KeyRound,
  ListChecks,
  LogOut,
  Menu,
  MonitorSmartphone,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";

type NavigationItem = {
  label: MessageKey;
  href: string;
  icon: LucideIcon;
};

const adminNavigation: NavigationItem[] = [
  { label: "nav.dashboard", href: "/admin", icon: Gauge },
  { label: "nav.accounts", href: "/admin/accounts", icon: Users },
  { label: "nav.activity", href: "/admin/activity", icon: Activity },
  { label: "nav.settings", href: "/admin/settings", icon: Settings },
  { label: "nav.security", href: "/admin/security", icon: ShieldCheck },
  { label: "nav.threats", href: "/admin/threats", icon: ShieldAlert },
  { label: "nav.audit", href: "/admin/audit", icon: ListChecks },
];

const userNavigation: NavigationItem[] = [
  { label: "nav.dashboard", href: "/portal", icon: Gauge },
  { label: "nav.devices", href: "/portal/devices", icon: MonitorSmartphone },
  { label: "nav.connection", href: "/portal/connection", icon: KeyRound },
  { label: "nav.security", href: "/portal/security", icon: ShieldCheck },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/admin" || href === "/portal") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  user,
  role,
}: {
  children: React.ReactNode;
  user: { name: string; username?: string | null };
  role: AppRole;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const navigation = role === "user" ? userNavigation : adminNavigation;

  async function logout() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  const sidebar = (
    <>
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
        <NoxRouteLogo className="text-sidebar-foreground" />
        <Button
          className="text-sidebar-muted lg:hidden"
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(false)}
          aria-label={t("nav.close")}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-5" aria-label={t("nav.main")}>
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                active && "bg-sidebar-accent text-sidebar-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {t(item.label)}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-sidebar-foreground">
            {user.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-xs font-medium text-sidebar-foreground">
              {user.name}
            </strong>
            <span className="block truncate text-[11px] text-sidebar-muted">
              {user.username ?? role}
            </span>
          </span>
          <Button
            className="text-sidebar-muted hover:text-sidebar-foreground"
            variant="ghost"
            size="icon"
            onClick={logout}
            aria-label={t("auth.signOut")}
            title={t("auth.signOut")}
          >
            <LogOut aria-hidden="true" />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar rtl:left-auto rtl:right-0 lg:flex">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-black/45"
            onClick={() => setMobileOpen(false)}
            aria-label={t("nav.close")}
          />
          <aside className="relative flex h-full w-[min(280px,86vw)] flex-col bg-sidebar shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-60 rtl:lg:pl-0 rtl:lg:pr-60">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-card/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <Button
              className="lg:hidden"
              variant="outline"
              size="icon"
              onClick={() => setMobileOpen(true)}
              aria-label={t("nav.open")}
            >
              <Menu aria-hidden="true" />
            </Button>
            <div>
              <p className="text-sm font-semibold">NoxRouteNeo</p>
              <p className="text-xs text-muted-foreground">
                {role === "user"
                  ? t("shell.userPortal")
                  : t("shell.administration")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={role === "owner" ? "success" : "outline"}>
              {t(`role.${role}` as "role.owner" | "role.admin" | "role.user")}
            </Badge>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.name}
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
