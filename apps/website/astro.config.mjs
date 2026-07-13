import { fileURLToPath } from "node:url";

import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

const repositoryUrl = "https://github.com/drslid/NoxRouteNeo";

export default defineConfig({
  site: "https://neo.noxroute.com",
  vite: {
    resolve: {
      alias: {
        "@repo-assets": fileURLToPath(
          new URL("../../docs/assets", import.meta.url),
        ),
      },
    },
  },
  integrations: [
    sitemap(),
    starlight({
      title: "NoxRouteNeo",
      logo: {
        src: "./src/assets/brand-mark.svg",
        alt: "NoxRouteNeo",
      },
      social: [
        {
          icon: "github",
          label: "NoxRouteNeo on GitHub",
          href: repositoryUrl,
        },
      ],
      editLink: {
        baseUrl: `${repositoryUrl}/edit/main/apps/website/`,
      },
      customCss: ["./src/styles/custom.css"],
      lastUpdated: true,
      locales: {
        root: {
          label: "English",
          lang: "en",
        },
      },
      head: [
        {
          tag: "meta",
          attrs: { name: "theme-color", content: "#071b2d" },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image",
            content: "https://neo.noxroute.com/images/social-card.png",
          },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:card", content: "summary_large_image" },
        },
      ],
      sidebar: [
        {
          label: "Getting started",
          items: [
            { label: "Overview", slug: "getting-started/overview" },
            { label: "Install on a VPS", slug: "getting-started/install" },
            { label: "First sign-in", slug: "getting-started/first-sign-in" },
          ],
        },
        {
          label: "User guides",
          items: [
            { label: "User portal", slug: "guides/user-portal" },
            { label: "Connect a device", slug: "guides/connect-device" },
            { label: "Admin portal", slug: "guides/admin-portal" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Architecture", slug: "reference/architecture" },
            {
              label: "Connection profiles",
              slug: "reference/connection-profiles",
            },
            { label: "VPS sizing", slug: "reference/vps-sizing" },
            { label: "Security model", slug: "reference/security" },
          ],
        },
        {
          label: "Project",
          items: [
            { label: "Comparison", slug: "project/comparison" },
            { label: "Status and scope", slug: "project/status" },
          ],
        },
      ],
    }),
  ],
});
