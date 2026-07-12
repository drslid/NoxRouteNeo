import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@noxroute/ui";
import {
  BookOpen,
  ExternalLink,
  FileCode2,
  Globe2,
  MonitorDown,
  Smartphone,
  TabletSmartphone,
} from "lucide-react";

import type { MessageKey } from "@/i18n/messages";
import { INCY_LINKS } from "@/lib/incy";

type Translator = (key: MessageKey) => string;

const commonResources = [
  {
    href: INCY_LINKS.appStore,
    label: "incy.appStore" as const,
    icon: Smartphone,
  },
  {
    href: INCY_LINKS.googlePlay,
    label: "incy.googlePlay" as const,
    icon: TabletSmartphone,
  },
  {
    href: INCY_LINKS.desktop,
    label: "incy.desktopDownloads" as const,
    icon: MonitorDown,
  },
  {
    href: INCY_LINKS.hwidGuide,
    label: "incy.hwidGuide" as const,
    icon: BookOpen,
  },
  {
    href: INCY_LINKS.website,
    label: "incy.officialWebsite" as const,
    icon: Globe2,
  },
];

export function IncyResources({
  audience,
  t,
}: {
  audience: "admin" | "user";
  t: Translator;
}) {
  const resources =
    audience === "admin"
      ? [
          ...commonResources,
          {
            href: INCY_LINKS.subscriptionGuide,
            label: "incy.subscriptionGuide" as const,
            icon: FileCode2,
          },
        ]
      : commonResources;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{t("incy.title")}</CardTitle>
        <CardDescription>
          {t(
            audience === "admin"
              ? "incy.adminDescription"
              : "incy.userDescription",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 pt-5">
        {resources.map(({ href, icon: Icon, label }) => (
          <Button
            key={href}
            asChild
            variant="outline"
            className="w-full sm:w-auto"
          >
            <a href={href} target="_blank" rel="noopener noreferrer">
              <Icon aria-hidden="true" />
              {t(label)}
              <ExternalLink aria-hidden="true" className="ms-auto sm:ms-0" />
            </a>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
