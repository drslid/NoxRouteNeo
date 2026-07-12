import { expect, test } from "@playwright/test";

const ownerPassword = process.env.OWNER_PASSWORD;

test("redirects anonymous users to the sign-in page", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("heading", { name: "Sign in to NoxRouteNeo" }),
  ).toBeVisible();
});

test("authenticates the local owner and renders the dashboard", async ({
  page,
}) => {
  test.skip(
    !ownerPassword,
    "OWNER_PASSWORD is required for the authenticated test",
  );

  await page.goto("/sign-in");
  await page.getByLabel("Username").fill("owner");
  const passwordInput = page.locator("#password");
  await passwordInput.fill(ownerPassword ?? "");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(passwordInput).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(passwordInput).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("heading", { name: "VPN dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Runtime queue healthy|runtime failures/).first(),
  ).toBeVisible();

  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("Admin domain")).toBeEditable();
  await expect(page.getByLabel("VPN domain")).toBeEditable();
  await expect(
    page.getByRole("button", { name: "Save configuration" }),
  ).toBeVisible();

  await page.goto("/admin/activity");
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "User" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Device" }),
  ).toBeVisible();

  await page.goto("/admin");

  await page.screenshot({
    path: `../../test-results/dashboard-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("renders the user dashboard, devices and connection access", async ({
  page,
}) => {
  const username = process.env.PORTAL_USERNAME;
  const password = process.env.PORTAL_PASSWORD;
  test.skip(!username || !password, "Portal credentials are required");

  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(username ?? "");
  await page.locator("#password").fill(password ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/portal$/);
  await expect(
    page.getByRole("heading", { name: "VPN dashboard" }),
  ).toBeVisible();
  await expect(page.getByText("Data used")).toBeVisible();

  await page.goto("/portal/devices");
  await expect(page.getByRole("heading", { name: "Devices" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Register device" }),
  ).toBeVisible();

  await page.goto("/portal/connection");
  await expect(page.getByRole("heading", { name: "Connection" })).toBeVisible();

  await page.screenshot({
    path: `../../test-results/portal-${test.info().project.name}.png`,
    fullPage: true,
  });
});
