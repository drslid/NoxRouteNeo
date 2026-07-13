# NoxRouteNeo public website

This Astro/Starlight application builds the public documentation site for
`https://neo.noxroute.com`. It is separate from `apps/web`, which is the
administrator and user portal installed on each VPS.

## Local development

From the repository root:

```bash
pnpm install
pnpm website dev
```

Build the same static output deployed by GitHub Pages:

```bash
pnpm website build
```

The generated site is written to `apps/website/dist`.

## Content

- English is the current published language and is served without a locale prefix.
- Documentation pages live in `src/content/docs`.
- Spanish, French, German, Simplified Chinese, Arabic, Russian, Portuguese,
  Hindi and Urdu are target languages. Add each locale to `astro.config.mjs`
  only after its complete page set is translated; exposing fallback English
  pages under translated URLs creates misleading duplicate search results.
- Product screenshots and diagrams are imported from the repository-level
  `docs/assets` directory so the README and website keep one source asset.

Do not publish secrets, deployment addresses, real subscription tokens or user
data in documentation screenshots.

## GitHub Pages activation

The workflow `.github/workflows/pages.yml` builds and deploys this application.
One repository administrator must perform these settings once:

1. Open **Settings > Pages** in `drslid/NoxRouteNeo`.
2. Select **GitHub Actions** as the build and deployment source.
3. Set the custom domain to `neo.noxroute.com`.
4. Verify `noxroute.com` for the `drslid` GitHub account using the TXT record
   supplied by GitHub.
5. Enable **Enforce HTTPS** after GitHub has issued the certificate.

## OVH DNS

In the OVH DNS zone for `noxroute.com`, create this explicit record:

```text
Type:        CNAME
Subdomain:   neo
Target:      drslid.github.io.
```

Do not create a wildcard record for `*.noxroute.com`. The apex domain remains
available for the separate NoxRoute commercial website, and future subdomains
such as `app.noxroute.com` can point to different infrastructure.
