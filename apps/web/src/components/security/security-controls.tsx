"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { authClient } from "@noxroute/auth/client";
import {
  changeOwnPasswordSchema,
  confirmPasswordSchema,
  type ChangeOwnPasswordInput,
  type ConfirmPasswordInput,
} from "@noxroute/contracts";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@noxroute/ui";
import {
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { useI18n } from "@/i18n/client";

type Provisioning = {
  qrCode: string;
  backupCodes: string[];
};

export function SecurityControls({
  twoFactorEnabled,
}: {
  twoFactorEnabled: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [provisioning, setProvisioning] = useState<Provisioning | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const passwordForm = useForm<ChangeOwnPasswordInput>({
    resolver: zodResolver(changeOwnPasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });
  const mfaForm = useForm<ConfirmPasswordInput>({
    resolver: zodResolver(confirmPasswordSchema),
    defaultValues: { password: "" },
  });

  async function changePassword(values: ChangeOwnPasswordInput) {
    const result = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });
    if (result.error) {
      toast.error(t("security.passwordUpdateFailed"), {
        description: result.error.message,
      });
      return;
    }
    passwordForm.reset();
    toast.success(t("security.passwordUpdated"), {
      description: t("security.otherSessionsRevoked"),
    });
    router.refresh();
  }

  async function configureTwoFactor(values: ConfirmPasswordInput) {
    if (twoFactorEnabled) {
      const result = await authClient.twoFactor.disable({
        password: values.password,
      });
      if (result.error) {
        toast.error(t("security.twoFactorUpdateFailed"), {
          description: result.error.message,
        });
        return;
      }
      toast.success(t("security.twoFactorDisabled"));
      mfaForm.reset();
      router.refresh();
      return;
    }

    const result = await authClient.twoFactor.enable({
      password: values.password,
    });
    if (result.error || !result.data) {
      toast.error(t("security.twoFactorSetupFailed"), {
        description: result.error?.message ?? t("security.setupCouldNotStart"),
      });
      return;
    }
    const qrCode = await QRCode.toDataURL(result.data.totpURI, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
    });
    setProvisioning({ qrCode, backupCodes: result.data.backupCodes });
    mfaForm.reset();
  }

  async function verifyTwoFactor() {
    if (!/^\d{6}$/.test(verificationCode)) {
      toast.error(t("auth.validSixDigits"));
      return;
    }
    setVerifying(true);
    const result = await authClient.twoFactor.verifyTotp({
      code: verificationCode,
      trustDevice: false,
    });
    setVerifying(false);
    if (result.error) {
      toast.error(t("security.codeVerificationFailed"), {
        description: result.error.message,
      });
      return;
    }
    toast.success(t("security.twoFactorEnabled"));
    setVerificationCode("");
    router.refresh();
  }

  async function copyBackupCodes() {
    if (!provisioning) return;
    await navigator.clipboard.writeText(provisioning.backupCodes.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function revokeOtherSessions() {
    const result = await authClient.revokeOtherSessions();
    if (result.error) {
      toast.error(t("security.sessionRevocationFailed"), {
        description: result.error.message,
      });
      return;
    }
    toast.success(t("security.otherSessionsRevokedTitle"));
    router.refresh();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("auth.password")}</CardTitle>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <form
            className="grid gap-4"
            onSubmit={passwordForm.handleSubmit(changePassword)}
          >
            <PasswordField
              label={t("auth.currentPassword")}
              error={passwordForm.formState.errors.currentPassword?.message}
              inputProps={passwordForm.register("currentPassword")}
            />
            <PasswordField
              label={t("auth.newPassword")}
              error={passwordForm.formState.errors.newPassword?.message}
              inputProps={passwordForm.register("newPassword")}
            />
            <PasswordField
              label={t("security.confirmNewPassword")}
              error={passwordForm.formState.errors.confirmPassword?.message}
              inputProps={passwordForm.register("confirmPassword")}
            />
            <Button
              className="justify-self-end"
              type="submit"
              disabled={passwordForm.formState.isSubmitting}
            >
              {passwordForm.formState.isSubmitting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <KeyRound />
              )}
              {t("security.changePassword")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("security.twoFactor")}</CardTitle>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          {provisioning ? (
            <div className="grid gap-5">
              <div className="grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start">
                <div className="rounded-md border bg-white p-2">
                  <Image
                    src={provisioning.qrCode}
                    width={240}
                    height={240}
                    alt={t("security.authenticatorQr")}
                    unoptimized
                  />
                </div>
                <div className="grid gap-3">
                  <label className="grid gap-2 text-sm font-medium">
                    {t("security.verificationCode")}
                    <Input
                      value={verificationCode}
                      onChange={(event) =>
                        setVerificationCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                    />
                  </label>
                  <Button
                    type="button"
                    onClick={verifyTwoFactor}
                    disabled={verifying}
                  >
                    {verifying ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <ShieldCheck />
                    )}
                    {t("security.verifyCode")}
                  </Button>
                </div>
              </div>
              <div className="rounded-md border bg-muted/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm">
                    {t("security.recoveryCodes")}
                  </strong>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={copyBackupCodes}
                    aria-label={t("security.copyRecoveryCodes")}
                    title={t("security.copyRecoveryCodes")}
                  >
                    {copied ? <Check /> : <Copy />}
                  </Button>
                </div>
                <code className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {provisioning.backupCodes.map((code) => (
                    <span key={code}>{code}</span>
                  ))}
                </code>
              </div>
            </div>
          ) : (
            <form
              className="grid gap-4"
              onSubmit={mfaForm.handleSubmit(configureTwoFactor)}
            >
              <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/50 p-3">
                <span className="text-sm font-medium">
                  {t("common.status")}
                </span>
                <span
                  className={
                    twoFactorEnabled
                      ? "text-sm font-medium text-emerald-700"
                      : "text-sm text-muted-foreground"
                  }
                >
                  {twoFactorEnabled
                    ? t("common.enabled")
                    : t("common.disabled")}
                </span>
              </div>
              <PasswordField
                label={t("auth.confirmPassword")}
                error={mfaForm.formState.errors.password?.message}
                inputProps={mfaForm.register("password")}
              />
              <Button
                className="justify-self-end"
                type="submit"
                variant={twoFactorEnabled ? "outline" : "default"}
                disabled={mfaForm.formState.isSubmitting}
              >
                {mfaForm.formState.isSubmitting ? (
                  <LoaderCircle className="animate-spin" />
                ) : twoFactorEnabled ? (
                  <ShieldOff />
                ) : (
                  <ShieldCheck />
                )}
                {twoFactorEnabled
                  ? t("security.disable2fa")
                  : t("security.enable2fa")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <div>
            <h2 className="text-sm font-semibold">
              {t("security.otherWebSessions")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("security.revokeDescription")}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={revokeOtherSessions}>
            {t("security.revokeOtherSessions")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordField({
  label,
  error,
  inputProps,
}: {
  label: string;
  error?: string;
  inputProps: React.ComponentProps<"input">;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <Input type="password" autoComplete="current-password" {...inputProps} />
      {error && (
        <span className="text-xs font-normal text-destructive">{error}</span>
      )}
    </label>
  );
}
