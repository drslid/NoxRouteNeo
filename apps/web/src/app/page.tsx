import { redirect } from "next/navigation";

import { getSession, sessionRole } from "@/lib/session";

export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  const role = sessionRole(session);
  redirect(role === "user" ? "/portal" : "/admin");
}
