# 21st ARK remote MCP

Endpoint: **`https://21st-ark.dev/mcp`**, Streamable HTTP. No API key or blog cookie should be copied into an AI application. Connect with an OAuth-capable remote MCP client; the browser opens the blog's account sign-in and explicit consent page.

더 보기 → **MCP 연결 안내** is available to guests and all account roles. It explains endpoint copying, OAuth sign-in and consent, draft review, role requirements, connection management and troubleshooting. Readers can open the author-application form; authors can jump to account connection settings.

The consent page shows the current account and provides **다른 계정으로 연결**. After confirmation, a browser-bound, same-origin request ends only the displayed account's current browser session (including other tabs), while preserving the pending OAuth request and existing MCP connections. Google/GitHub sign-in returns to that request. Scopes are selected afresh for the new account's current role, and connecting still requires explicit consent. Cancelling sign-in leaves the browser signed out; expired requests must be restarted from the AI app. This operation does not link or merge social identities.

## Capabilities and publication boundary

| Tool | Required scope | Operation |
| --- | --- | --- |
| `get_account` | `account:read` | Own profile, login email, role and identity-provider connection status |
| `get_writing_guide` | `account:read` | Markdown limits and syntax for images, tables, code, links and explicit video embeds |
| `list_posts` | `posts:read` | Own drafts and published posts/notices, paginated with status/kind filters |
| `get_post` | `posts:read` | Own full post, including Markdown and revision |
| `get_categories` | `posts:read` | Global topics and own private category/tag choices |
| `create_label` | `posts:write` | Own category/tag creation; existing names are reused |
| `create_draft` | `posts:write` | Save a private Markdown draft or notice |
| `update_draft` | `posts:write` | Replace a private draft, requiring its current revision |
| `upload_image` | `posts:write` | Validate and store an image in private R2 from base64 or a public HTTPS image URL |
| `get_analytics` | `analytics:read` | Own post totals and daily/per-post engagement statistics |

All operations are restricted to the connected user, even when that account is an administrator. Readers can connect for account information but do not obtain author permissions. The current role, disabled state and login version are rechecked on every request/tool execution.

**MCP cannot publish, unpublish, delete, or modify published content.** There are no publication/deletion scopes or tools. The trusted shared post service also enforces `status='draft'` and an atomic draft/revision condition for MCP writes. Browser cookies are never synthesized and browser Origin checks are not bypassed. Existing browser routes resolve their own session; an MCP Bearer token is not a browser login.

After saving, the tool returns `editor_url` (`/write?post=ID`). The human opens it, reviews Markdown/images/links using the existing editor/preview, then clicks Upload and its confirmation dialog. A published post must be edited on the website. AI can create a separate new draft instead.

## Rich Markdown

Call `get_writing_guide`, then `get_categories`, upload any images, and save the resulting Markdown with `create_draft`.

```markdown
# Title

**Emphasis**, a [normal link](https://example.com), lists and GFM tables work.

![Image alt text](/api/media/posts/OWNER/IMAGE.webp)

[Link card](<https://example.com> "링크 카드")

[Video title](<https://www.youtube.com/watch?v=dQw4w9WgXcQ> "영상 임베드")
```

A normal video URL remains a link. Only the explicit video marker produces the existing YouTube/Vimeo viewer. HTML/scripts/arbitrary iframes do not execute. Markdown is stored as Markdown; no client-side editor conversion is required to save it.

`upload_image` takes exactly one of `image_url` or `base64` (without a data-URL prefix). Base64 also requires `content_type`. JPG/PNG/WebP files are limited to 8 MiB, existing dimension/pixel limits and per-account quotas. It returns `image_key`, `source` and a ready-to-insert `markdown` string; use `image_key` for a representative banner (recommended 1600 × 900). Newly uploaded, unattached/draft images stay private. Do not give the MCP server credentials for external image hosts. AI image generation is performed by the connected AI service; the blog imports/uploads its result and does not call a model API.

Image imports use HTTPS-only public addresses, manual redirects validated at every hop, a 15-second total deadline, streaming size bounds, MIME/signature/dimension checks, no forwarded credentials and the Workers `global_fetch_strictly_public` flag for resolved-address/same-zone SSRF protection. SVG and authenticated/private URLs are refused.

Create/update/upload calls require `request_key` (8–100 letters/numbers/underscore/hyphen). Reuse it only for retries of the same operation and exact input; use a new key for each edit/image. Results are retained for 24 hours, input changes return 409, concurrent writes are serialized, and stable draft IDs, mutation markers and image object keys recover committed work after an interrupted response. Revisions still protect concurrent human changes. An uncertain upload failure can leave an unattached object; normal storage quotas continue to apply.

## Authentication and consent

Cloudflare's maintained `@cloudflare/workers-oauth-provider` handles OAuth 2.1 discovery, PKCE S256, authorization code exchange, refresh rotation, revocation, resource audience binding, CIMD and legacy Dynamic Client Registration. The official MCP TypeScript server SDK serves modern requests and a stateless 2025-protocol compatibility path from the same tool factory. Official client SDK interoperability is tested.

Protocol endpoints:

- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource/mcp` (root variant also supported)
- `/oauth/authorize`, `/oauth/token`, `/oauth/register` and the provider-advertised revocation endpoint
- `/connect?request=...` — private, noindex consent UI

CIMD clients identify themselves by their HTTPS metadata document. DCR client names are self-asserted; the consent UI says so. The verified metadata domain, callback hostname, and a warning for local callbacks are displayed. Client metadata is rendered as text and external client logos are not loaded. PKCE is required for confidential clients too. Native callbacks must be HTTPS or loopback HTTP; arbitrary private-use schemes are not enabled.

Consent requests expire after 10 minutes and are stored server-side, bound to a random per-flow HttpOnly SameSite cookie. Approval requires same-origin POST, the displayed current account, a confirmed username, a checked scope set and a single-use request. Both existing Google/GitHub login and new-member signup return to this consent flow; ordinary website login still returns home. Decline works without signing in. No consent is inferred from a previous connection. Reauthorizing the same client installation replaces its previous grant, so reducing permissions cannot leave an older, broader token active. CIMD installations with distinct callback URIs retain independent grants under the provider’s policy.

Access tokens last 10 minutes. `offline_access` permits rotating refresh tokens with a fixed maximum 30-day connection lifetime. Without that consent, no refresh token is issued and the connection expires after at most 10 minutes. Account deletion, suspension, login-version changes, connection expiry and explicit revocation block subsequent access. Signing out of a browser does not revoke separate app connections; use Account and settings → Connected apps.

The OAuth provider's text/JSON KV storage subset is backed by **D1** (`mcp-storage.ts`). No new KV namespace, Durable Object, external identity SaaS or paid subscription is required. Tokens/codes/secrets are hashed and props are encrypted by the upstream provider. Adapter TTL filtering/pagination is covered by end-to-end exchanges; primary D1 reads and a bounded cross-isolate lease serialize the provider's non-atomic read/modify/write operations. Contention returns retryable 503 with Retry-After. A crashed lease expires after two minutes. This is intentionally suited to this blog's account volume; high-volume authorization would warrant partitioning the locking/storage service.

`mcp_connections` supplies an additional immediate revocation/role/login-version check independent of library token cleanup. D1 foreign keys remove user-scoped token/grant storage, connections, operations and activity on account deletion. Abandoned anonymous flows expire in 10 minutes; dynamic client records expire under the provider's TTL policy.

## Operations

Everything runs through the current web Worker → private API Service Binding. `/mcp`, `/oauth/*` and discovery routes bypass public profile SSR. No public API Worker URL is enabled. Existing Workers builds apply migration `0019_mcp.sql` before backend deployment. No new OAuth app secrets are needed: existing Google/GitHub sign-in is reused.

Account and settings → Connected apps shows the copyable endpoint, granted scopes, connection/expiry/last-used time, explicit disconnect confirmation and the latest 30 tool activity records. Logs store tool/post identifiers, outcome and time, never bodies/images/tokens. Activity is retained for at most 90 days; expired connections are removed after a further 90 days. Hourly cleanup handles expired OAuth storage, flows, idempotency results and leases. Normal browser account controls are protected while revocation is pending.

Check both Worker builds after deployment, then verify unauthenticated MCP returns 401 with protected-resource discovery, metadata advertises the canonical domain, and `/connect` is noindex/no-store. Do not approve an unknown app or create production test posts to check connectivity. A real AI client's first connection/consent remains an action for the user; automated tests use isolated workerd/D1/R2 and fixture accounts.

```sh
npm run check
npm run test:mcp
```

Additional regression coverage: `test:features`, `test:github`, `test:taxonomy`, `test:account-controls`, `test:seo-usernames`, `test:security-performance`, `test:profile-media`, `test:navigation`, `test:render`.

Client compatibility depends on its remote Streamable HTTP and OAuth implementation. Browser-only cross-origin MCP callers are not enabled; server/desktop clients should send no Origin header (or the canonical server origin). No paid plan was enabled by this implementation; normal Workers/D1/R2 usage and CPU/storage limits still apply.

References: [Cloudflare remote MCP](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/), [Cloudflare OAuth provider](https://github.com/cloudflare/workers-oauth-provider), [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).
