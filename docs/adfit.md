# Home and search advertising

Home and search choose a fresh random gap of 3, 4 or 5 organic posts for each
ad slot. The layout is seeded per page visit and feed criteria, keeping positions
stable across renders, returning from a reader and appending pages. Ads do not
count toward gaps. Complete non-empty short lists retain at least one slot after
the last post; partial pages never add a temporary trailing slot. Empty lists
show no ad. Pinned posts count as organic posts and keep their order.
Ad rendering still depends on AdFit fill, privacy preferences and available width.
Ads are not stored as posts and do not change totals, likes or bookmarks.
Search uses a matching card within the latest/results grid. Writer pages, saved
posts, subscriptions and the article reader do not display ads.

The publisher account's Web inventory supports fixed banners. The selected
**300 × 250** PC/mobile creative is centred inside the existing post width,
with the same spacing, header rhythm and separator. Do not stretch/crop the
creative or disguise it as an author's post; `광고` / `AD` remain visible.

## Publisher configuration

Media: `21st ARK`, `https://21st-ark.dev`, media ID `NJa`.
Three public placement IDs are configured in `apps/frontend/src/adfit.js`:
The existing publisher inventory names below retain their original “7개 간격”
labels; placement frequency is controlled by the website and is now three posts.

| Name | Ad unit | Size |
| --- | --- | --- |
| 홈 피드 7개 간격 01 | DAN-OYeMHcjldND26edn | 300 × 250 |
| 홈 피드 7개 간격 02 | DAN-O1A7lkHd8yDKbGHn | 300 × 250 |
| 홈 피드 7개 간격 03 | DAN-2M7vPox6y0K0TXwb | 300 × 250 |

All three have creative auto-refresh disabled. Ad unit IDs are public publisher
configuration, not credentials. Do not call `setKakaoAccountId` or attach blog
account IDs, email, draft content, or application credentials to ad requests.

The media was **pending review** when configured. Real inventory depends on
Kakao's approval and availability. No actual posts produces no ad request; do not
create dummy posts or synthetic impressions to trigger review.

## Lifecycle and safety

- Load the official asynchronous SDK once, only when a slot becomes visible on
  the registered HTTPS hostname. Never send live requests from local tests or
  preview deployments.
- Respect DNT/GPC. Reserve 250px for the creative. A slot with less than 300px
  available width collapses instead of scaling/cropping or overflowing the feed.
- The current SDK rejects duplicate concurrent ad unit IDs. Visible slots lease
  one of the three distinct IDs. Destroy and release an offscreen ad before its
  ID is used by another slot; waiting slots do not make duplicate requests.
- No custom periodic refresh. Destroy ads when the tab is hidden, a reader or
  account dialog opens, navigation leaves Home/search, or the component unmounts.
- Each creative is rendered by the official SDK with the issued dimensions.
  No publisher iframe wrapper: AdFit's policy disallows requesting ads inside
  publisher-created iframes. SDK-created creative frames remain untouched.
- Failure/no-fill removes only that slot. Feed reading, pagination and reactions
  remain available with blocked scripts and network failures.
- CSP allows named Kakao SDK/request/frame hosts; it retains disabled inline
  script attributes, `unsafe-eval` exclusion and frame-ancestor protection.
  Standalone OAuth consent does not allow the advertising SDK.
- Privacy document version `2026-11-20.3` discloses advertising data processing,
  DNT/GPC support, cookie controls and Kakao's privacy/advertising links.

## Verification

`npm run test:adfit` exercises the real App and SDK lifecycle with stubbed
creatives. It verifies cadence across pagination, no replacement of posts,
Home/search placement and minimum-one/empty-list behavior, single SDK loading, unit leasing/destruction/reuse, no-fill,
hidden tabs, DNT, narrow slots and CSP. It makes no real ad calls or clicks.

Sources: [Web SDK](https://kakaobusiness.gitbook.io/main/partner/adfit/adfit-sdk/web-sdk),
[SDK source](https://t1.kakaocdn.net/kas/static/ba.min.js),
[operating policy](https://adfit.kakao.com/web/html/use_kakao.html).
