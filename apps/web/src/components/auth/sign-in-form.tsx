"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { authClient } from "@noxroute/auth/client";
import { signInSchema, type SignInInput } from "@noxroute/contracts";
import { Button, Input, Label } from "@noxroute/ui";
import { Eye, EyeOff, LoaderCircle, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { useI18n } from "@/i18n/client";

export function SignInForm() {
  const router = useRouter();
  const { t } = useI18n();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { username: "", password: "" },
  });

  async function onSubmit(values: SignInInput) {
    const result = await authClient.signIn.username({
      username: values.username,
      password: values.password,
      rememberMe: false,
    });

    if (result.error) {
      toast.error(t("auth.failed"), {
        description: t("auth.failedHint"),
      });
      return;
    }

    if (result.data && "twoFactorRedirect" in result.data) {
      router.push("/two-factor");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form
      className="mt-8 grid gap-5"
      method="post"
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <div className="grid gap-2">
        <Label htmlFor="username">{t("auth.username")}</Label>
        <Input
          id="username"
          autoComplete="username"
          aria-invalid={Boolean(form.formState.errors.username)}
          {...form.register("username")}
        />
        {form.formState.errors.username && (
          <p className="text-xs text-destructive">
            {form.formState.errors.username.message}
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{t("auth.password")}</Label>
        <div className="relative">
          <Input
            className="pe-10"
            id="password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="current-password"
            aria-invalid={Boolean(form.formState.errors.password)}
            {...form.register("password")}
          />
          <Button
            className="absolute end-1 top-1/2 -translate-y-1/2 text-muted-foreground"
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setPasswordVisible((visible) => !visible)}
            aria-label={
              passwordVisible ? t("auth.hidePassword") : t("auth.showPassword")
            }
            title={
              passwordVisible ? t("auth.hidePassword") : t("auth.showPassword")
            }
          >
            {passwordVisible ? (
              <EyeOff aria-hidden="true" />
            ) : (
              <Eye aria-hidden="true" />
            )}
          </Button>
        </div>
        {form.formState.errors.password && (
          <p className="text-xs text-destructive">
            {form.formState.errors.password.message}
          </p>
        )}
      </div>
      <Button
        className="mt-1 w-full"
        type="submit"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <LogIn aria-hidden="true" />
        )}
        {form.formState.isSubmitting ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
    </form>
  );
}
