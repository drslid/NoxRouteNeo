"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function LiveRefresh({ interval = 10_000 }: { interval?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, interval);
    return () => window.clearInterval(timer);
  }, [interval, router]);

  return null;
}
