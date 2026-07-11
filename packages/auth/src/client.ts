"use client";

import { createAuthClient } from "better-auth/react";
import {
  adminClient,
  twoFactorClient,
  usernameClient,
} from "better-auth/client/plugins";

import { accessControl, appRoles } from "./permissions";

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    adminClient({ ac: accessControl, roles: appRoles }),
    twoFactorClient(),
  ],
});

export const { signIn, signOut, useSession } = authClient;
