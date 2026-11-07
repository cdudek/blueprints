---
name: seo
description: SEO and GEO rules for every public page: server HTML, head pipeline, sitemap, schema.org, social tags, AI-crawler policy, URLs, caching, checks.
read-when: building or changing any public page, route, metadata, sitemap, robots, redirects, CMS content model, or caching of public routes.
skip-when: working on pages behind sign-in only, or on non-web deliverables.
---

# SEO and GEO

SEO (search engines) and GEO (AI answer engines) are on by default for every public page, from the first page, not added later. One idea carries it: crawlers and AI agents read the first server HTML, so everything they should find, cite or trust is there, built from the same data as the visible page, by one pipeline.

## Rules

### Source of truth

- **SEO-1: Everything a crawler or AI should cite is in the initial server HTML.** AI crawlers do not run JavaScript. Public pages render on the server; client-only content does not count.
- **SEO-2: Bots get the same HTML as people.** No separate bot rendering. Placeholder, dummy or blurred filler content is not in the DOM, even hidden: it gets indexed.
- **SEO-3: Values are text.** Facts (price, size, date, rating, feature present or not) are text in label/value pairs, never an icon or a colour alone.
- **SEO-4: Facts supplied by a vendor or third party carry a visible note** ("as stated by the vendor"). Ratings from external sources never go into markup.

### Head pipeline

- **SEO-5: One head pipeline builds metadata for every page.** Pages pass data in; the pipeline returns title, description, robots, canonical, alternates, Open Graph and Twitter. No page writes its own head tags. Defaults, canonical cleanup and the noindex rules live here and are unit-tested.
- **SEO-6: Fallback chain for title and description:** editor override, then localised template per page type, then site default. Template example: `{entity} {intent} {year} | Brand`; the year is injected at render, never typed.
- **SEO-7: Length limits.** Title up to 60 characters, description 70 to 160, one H1 per page, H1 and title say the same thing in different words. Page N of a paginated list says "Page N" in title, description and H1. A lint fails on violations.
- **SEO-8: Canonical is absolute, lowercase, self-referencing, without query string.** Page 2 and later canonicalise to themselves, not to page 1. Unknown or tracking parameters keep the page indexable with a clean canonical. Schema `url` and `og:url` use the canonical, never the request URL.
- **SEO-9: Alternates.** With more than one locale, `hreflang` for every locale from the same path builder as the canonical, plus `x-default`. Each alternate points at the canonical URL of that locale, never a redirect, never a 404. Language-only codes until content truly differs per country. A translated article lists alternates only for translations that exist. The language switcher links are in the server HTML.

### Robots and indexing

- **SEO-10: Default robots meta is `index, follow, max-snippet:-1, max-image-preview:large`.**
- **SEO-11: Noindex by rule, not by accident.** `noindex, follow` for: known filter and sort parameters (an explicit list), combinatorial pages (X vs Y) and thin pages until real content exists, empty entity pages, utility, funnel, account and lead/private-data pages. Debug or client-only modes also send `X-Robots-Tag: noindex`.
- **SEO-12: A noindex page has no canonical and no alternates, and is never in a search sitemap.** The pipeline removes them. Functional links to it (sign-in, account) are fine.
- **SEO-13: Missing things are real 404s** with a 404 status (cached), never a 200 soft 404.
- **SEO-14: robots.txt** disallows app, admin, api and auth paths, references the sitemap index, and states the AI-crawler policy (GEO-6).

### Sitemap

- **SEO-15: The sitemap is generated from the route and content registry.** Never hand-kept. One registry feeds routes, sitemap and navigation (see [structure](structure.md)).
- **SEO-16: Shape.** A sitemap index per locale, one child sitemap per page type, split below 50,000 URLs. Each entry: absolute canonical URL, `hreflang` alternates, real `lastmod`.
- **SEO-17: `lastmod` is the newest change of the page and its related entities,** from data. Never the build date, never the publish date for a changed article.
- **SEO-18: Exclusions.** noindex pages, app, admin, api, auth, share and invite links, redirecting URLs, empty pages.
- **SEO-19: Generation never depends on a slow backend call.** Read from the database or a cache with a time bound; on failure serve the last good sitemap. Cache about one hour. Compress.

### Structured data

- **SEO-20: JSON-LD is one `@graph` per page,** built from the same data object as the visible page, typed (use a schema type library). Organization and WebSite are linked by `@id` on every page.
- **SEO-21: Server only.** JSON-LD is identical in server HTML and hydrated DOM. Client code never builds or changes it.
- **SEO-22: Mark up only what is visible.** No invented authors, no markup for content hidden from users. ISO values: ISO 4217 currency, ISO 8601 dates, ISO language codes. Required fields are filled even on free tiers.
- **SEO-23: Ratings.** `aggregateRating` only with at least one review, from server totals (best 5, worst 0). `review[]` only for reviews rendered on the page. The site's own Organization never carries a rating.
- **SEO-24: Types per page.** Home: Organization (`@id`, `contactPoint`, `sameAs`) and WebSite. Every page: BreadcrumbList. Listings: CollectionPage and ItemList with correct `position` and `numberOfItems` across pagination. Product or app: Product or SoftwareApplication with Offer, `applicationCategory`, `featureList`. Article: author (`jobTitle`, `sameAs`, `image`), `publisher`, `mainEntityOfPage`, `datePublished`, `dateModified`. Local or agency: LocalBusiness or ProfessionalService. Video: VideoObject. Event, HowTo, FAQPage where the page really is one.
- **SEO-25: Do not build markup for rich results Google no longer shows** (FAQ for most sites, Fact Check, Course) for Google's sake. FAQ markup may stay for answer engines when the FAQ is visible.

### Social tags

- **SEO-26: Full Open Graph and Twitter set on every page.** `og:title`, `og:description`, `og:image` (1200x630, absolute URL, with alt), `og:type`, `og:url`, `og:site_name`, `og:locale` plus alternates, `twitter:card` as `summary_large_image`, `article:published_time` and `article:modified_time` for articles. Site-wide defaults, overridden per page. A missing or relative image URL is a bug.
- **SEO-27: `og:locale` and schema `inLanguage` come from the page locale,** never hardcoded (see [i18n](i18n.md)).

### GEO

- **GEO-1: Answer first.** The question as heading, a direct answer in one or two sentences, then detail. Facts with numbers and dates; visible author and updated date; semantic HTML (headings, lists, tables, definition lists).
- **GEO-2: Q&A summary blocks with a freshness date** on product and guide pages, built from visible content.
- **GEO-3: Link budget.** About 100 to 150 links per page. Navigation must not use up the first 5,000 to 6,000 characters that AI agents read; main content comes early in the HTML.
- **GEO-4: Bulk internal-linking changes** ship in batches with dates so effects can be attributed.
- **GEO-5: `llms.txt`** at the root lists the key pages with one-line descriptions, generated from the registry. Regenerate on deploy.
- **GEO-6: Deliberate AI-crawler policy in robots.txt,** recorded as a decision (see [decisions](decisions.md)). Default: allow answer and search crawlers (for example GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended); block training-only crawlers (for example CCBot, Bytespider). Check the current list of user agents at build time.
- **GEO-7: TDMRep.** Serve `/.well-known/tdmrep.json` stating the text and data mining reservation that matches the policy.
- **GEO-8: Trust signals are real.** Verified reviewers, visible counts, AI-generated content labelled.

### URLs and redirects

- **SEO-28: URLs are lowercase, no trailing slash, no `/1` for page one,** pagination in the path (`/list/page/2`), locale prefix per [i18n](i18n.md). The unprefixed or uppercase duplicate redirects.
- **SEO-29: Permanent moves use 301 or 308, never 302.** Old slugs redirect to the current slug. A page past the last page redirects to page one; page below one is 404. Redirects are data in one table, not scattered code.

### Caching, performance, images

- **SEO-30: Crawlers get the anonymous page.** Cacheable public routes strip cookies and per-request meta from the cached HTML. Vary on a CDN-set header, never on a raw cookie. Cache catalog pages about one hour, static pages one day, with stale-while-revalidate and stale-if-error; purge by entity key on change.
- **SEO-31: Performance budget on landing pages.** LCP under 2.5 s, no render-blocking stylesheet, LCP image preloaded with high fetch priority and sized, preconnect to the CDN and required third parties, fonts as WOFF2 with `font-display` set and preloaded for the first view, no layout shift.
- **SEO-32: Every image has localised alt text** (empty alt only for decoration), explicit width and height, a resize and format pipeline from day one.

### CMS

- **SEO-33: SEO fields are part of every content model,** per entity and per subpage: meta title, meta description, H1, canonical override, noindex, top and bottom copy. Any component or content migration keeps them. Missing fields fall back per SEO-6.

## How to apply

1. Define the route and content registry first; derive sitemap, navigation, `llms.txt` and redirects from it.
2. Build the head pipeline and the schema builders (one per page type) before the first page. Pages only pass data.
3. Add robots.txt, sitemap index, `llms.txt`, `tdmrep.json` and the AI-crawler decision record.
4. Set caching headers for public routes with the anonymous-page rule.
5. Add the CI checks below before the second page type exists.
6. After launch, connect monitoring. When changing URLs, add the redirect row in the same change.

```
sitemap.xml                 index (per locale)
  sitemap-{locale}-{type}.xml   child per page type, lastmod from data
robots.txt                  rules + Sitemap: line + AI-crawler policy
llms.txt                    key pages, generated
.well-known/tdmrep.json     TDM reservation
```

## Checks

- **Bot-parity test:** fetch raw HTML with bot user agents (Googlebot, GPTBot) and with a plain client; assert title, canonical, robots, JSON-LD, main text and key facts are present and equal. Runs in CI against a production build.
- **Schema validation** of every JSON-LD page type against schema.org and rich-result rules; assert server and hydrated JSON-LD are equal.
- **Head unit tests:** noindex pages carry no canonical or alternates; canonical is lowercase, absolute, without query; `x-default` present; `og:image` absolute.
- **Sitemap completeness test:** every public indexable route is listed; no private, noindex or redirecting URL is; each entry has `lastmod`.
- **Link checker** for internal links, redirect chains and hreflang targets.
- **Length lint** for title, description and H1 on every page type and CMS entry.
- **Lighthouse or equivalent** budget for LCP and layout shift on landing pages.
- Left to review: answer-first wording, link budget on new templates, the AI-crawler decision.

## Monitoring

- Connect Search Console and keep its data in the warehouse.
- Track GEO citations over a fixed set of 50 or more queries on a schedule.
- Run a monthly decay detector: multi-week loss in position, CTR or impressions. CTR falling at stable position points to AI answers taking the click.
- Large internal-link or template changes get a dated entry so effects can be tied to causes.

## Mistakes to avoid

- A rich-results audit found zero schemas because markup was built in the browser. Build it on the server.
- Schema `url` taken from the request URL carried query strings. Use the canonical.
- Inconsistent or missing `x-default`, relative `og:image`, 302 for permanent moves.
- Article `lastmod` equal to publish date after edits, so crawlers ignored updates.
- Sitemap generation waited on a slow backend and timed out; crawlers saw an empty or stale file.
- hreflang pointed at a redirecting variant or a 404 alternate, and Google dropped the set.
- Empty entity pages returned 200 and were listed in the sitemap.
- Placeholder content hidden with CSS was indexed.
- Facts shown as icons or colours were invisible to AI readers.
- Navigation with hundreds of links pushed the real answer out of the window AI agents read.
- A login cookie in Vary meant crawlers got uncached or personalised pages.
- Component migrations dropped SEO fields silently.
