# Public member profiles

All active, signed-up accounts have public profiles regardless of `reader`,
`author`, or `admin` role and regardless of whether they have published posts.
The existing `/api/writers` routes and `/:username` URLs remain compatible.

- Search/listing includes active members. Display name, current username and
  public bio are searchable; topic/category filters still require matching
  published posts. Login email is never searched or returned.
- Public ID/username lookup, SSR/social metadata, profile images and sitemaps use
  the same active-account visibility rule. Disabled/deleted accounts stay hidden.
- Any signed-in member may subscribe to another active member, including a reader
  without posts. Self-subscription is rejected. Guest subscriptions require login.
  Repeated subscribe/unsubscribe requests are idempotent and Origin protected.
- Subscription state belongs to the requesting account. A subscribed reader
  without public posts has `latest_post: null`; drafts never become updates.
  Subscription records survive changes in posting role.
- Public categories/tags still contain only labels attached to published posts.
  Taxonomy changes, post writing/publishing and analytics retain author/admin
  checks; making a profile public never grants posting privileges.
- Search and the people menu use “프로필” / “멤버” to distinguish discoverable
  members from the author permission needed to publish posts.

`npm run test:public-profiles` checks anonymous reader lookup/search, private
field/draft/media protection, reader-to-reader subscriptions, role/suspension
handling, unchanged writing guards and the real React search/profile/login flow.
`scripts/test-seo-usernames.mjs` additionally checks reader SSR and sitemap URLs.
