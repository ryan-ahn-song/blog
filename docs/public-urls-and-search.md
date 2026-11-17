# Public URLs, previews and search

## Address rules

- Sidebar pages use `/home`, `/search`, `/people`, `/bookmark`, `/write`, `/my-posts`, `/subscriptions` and `/admin`. The root redirects to `/home`, retaining OAuth callback query parameters and legacy fragments. Direct visits and browser Back/Forward restore the selected screen; search terms/topics and edit targets are included in the URL.
- Home and people are publicly rendered and indexed. Account, saved, subscription, writing, management and search screens serve a generic `noindex` shell without a public API lookup or private data. Client requests still require the corresponding session and role.
- Display names and URL usernames are separate. Display names do not have to be unique.
- Usernames contain 2–50 characters, start with a letter, and allow Unicode letters/numbers, `_` and `-`. Whitespace, route names and the legacy `user-` namespace are reserved.
- NFKC normalization and case folding enforce uniqueness in the API and database. The selected spelling is retained in canonical URLs.
- Profiles use `/{username}`; posts and notices use `/{username}/posts/{postId}`. Legacy `#writer-{id}` and `#post-{id}` links remain supported by the client.
- New members choose a username after OAuth alongside their display name and consent. Existing members choose one on their next authenticated visit. Account settings support availability checks and username changes; profile editing retains the display name, biography and images.
- Previous usernames remain reserved for that account and redirect to its current canonical address. Account deletion cascades these aliases. Changes are rate limited and each account can retain at most 50 aliases.
- New menu names cannot be claimed as usernames. An existing username matching a menu name remains reachable with an `@` prefix, for example `/@home`; its posts use `/@home/posts/{postId}`. Display names and existing account data are not renamed.
- Compact writer labels show up to 16 graphemes plus an ellipsis, with the complete name in the hover title. Directory introductions are limited to three visible lines. Full profile names and stored values are retained.

## Public rendering

The frontend Worker fetches an explicit anonymous public DTO through the API service binding and returns title, description, canonical URL, Open Graph, Twitter large-image metadata and JSON-LD in the initial HTML. The same initial document is returned to people and crawlers. Public post text and native links are present before JavaScript starts; React takes over after loading.

The banner is served through `/api/social/posts/{postId}/image`, with a 1200×630 brand fallback for posts without a banner. Profiles use their cover/avatar or the same fallback. These image routes recheck public visibility on every request and do not expose draft images. They allow cross-origin image use specifically for social previews; normal media protections remain intact. HTML and image responses use `private, no-store` so a visibility change does not leave a stale edge copy.

Drafts, disabled accounts and reader-only private profiles return 404 with `noindex` and do not appear in sitemaps. Cookies and authorization headers are never forwarded into the public HTML lookup. Dynamic strings are escaped and JSON-LD cannot break out of its script element.

## Discovery and deployment

`https://21st-ark.dev/robots.txt` advertises `/sitemap.xml`. The sitemap index links `/home`, `/people` and public post/writer chunks of at most 1,000 URLs. Aliases redirect to the current username instead of producing duplicate indexable pages.

Apply migration `0018_usernames.sql` before deploying the API and frontend. It preserves existing display names and data and assigns provisional `user-{id}` addresses until members choose usernames. The connected backend build applies remote migrations before deployment.

Search engines choose when and whether to index pages. Deploying crawlable HTML and sitemaps does not guarantee immediate search results. The sitemap can be submitted in an already verified Search Console property. Messenger services also maintain their own preview caches; new canonical URLs should be shared after deployment, and an existing cached preview may require that service's refresh tool.

References: [Google JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Open Graph protocol](https://ogp.me/).

## Verification

Run `npm run test:navigation` for direct routes, search reloads, native menu links, browser history, delayed authentication, private view guards, direct draft editing, unsaved changes, save return paths and name truncation. Its third-party editor canvas is isolated while testing the real application routing and loading/saving contract. Run `npm run test:seo-usernames` for migration preservation, normalized duplicates, concurrent/stale claims, signup retry, old address reservation, anonymous initial HTML and metadata, escaping, private/draft/disabled visibility, public social images, canonical redirects, robots and sitemaps. Existing auth, account, comment, taxonomy, application, notices/history, security/performance and render tests cover the affected integrations.
