---
name: nextjs-seo
description: One Next.js Metadata API pipeline for localized public pages, structured data and crawl controls
read-when: adding a public page, metadata, canonical URL, sitemap or social image
skip-when: changing an internal operation with no public page or URL
---

# SEO

Apply [core SEO](../../core/references/seo.md). This reference maps its one head pipeline to the App Router Metadata API and file conventions. The canonical site origin is server runtime configuration, not whichever preview host handled the request.

## Rules

- **NEXT-SEO-1 Use one metadata composition path.** Root metadata owns `metadataBase` and the site defaults. Page metadata or `generateMetadata` supplies localized title, description, canonical and alternates through shared typed helpers. Do not add parallel manual head tags or a second SEO library. Read the installed framework's metadata merge rules before relying on inherited nested values.
- **NEXT-SEO-2 Public discovery is explicit.** Use the framework's `sitemap.ts`, `robots.ts`, icon and social-image conventions. Sitemaps list only canonical, indexable, successful public routes and locales. Sign-in, private app routes, internal tools and previews are noindex. Robots directives are crawl guidance, not access control.
- **NEXT-SEO-3 Derive absolute URLs from validated configuration.** Production fails on a missing canonical origin instead of emitting localhost links in metadata, email or share URLs. Preview origins are allowed for test navigation, but never become production canonicals. The same locale model drives `hreflang`, canonical paths and navigation.
- **NEXT-SEO-4 Structured data has one safe renderer.** Pages supply typed data to a shared JSON-LD serializer that escapes script-breaking characters. Never interpolate user strings into script markup. Match the visible page and schema type, following core's editorial rules. Public content renders on the server without requiring a browser analytics or consent SDK.

## How to apply

Set the canonical origin and root defaults, then add metadata, discovery and social-image coverage as each public route ships. List key SEO pages in the product's performance policy. Avoid creating a catch-all metadata helper that must know every business module; modules provide data to the delivery layer.

Changing later: test redirects and canonicals for old URLs as well as new ones. Treat a public URL change as the migration core requires.

## Checks

- Automatic: production HTML has one canonical, correct localized title and description, valid alternates and JSON-LD; sitemap entries resolve and exclude private routes; missing canonical config fails production startup.
- Automatic: previews send noindex, and social images and icons return successfully from the built app.
- Review: search intent, visible content versus structured data, indexability decisions and social-image legibility.

## Mistakes to avoid

- A preview hostname in a production sitemap.
- Combining Metadata API output with hand-built duplicate tags.
- Treating a robots exclusion as protection for private data.
