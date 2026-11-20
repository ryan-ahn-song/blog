# Home feed advertising

Home inserts one labelled AdFit slot after each seven organic posts (7, 14, 21,
28…), including across appended API pages. Ads are not stored as posts and do not
change post totals, pagination, likes or bookmarks. Search, writer pages, saved
posts, subscriptions and the article reader do not display ads.

The publisher account's Web inventory supports fixed banners. The selected
**300 × 250** PC/mobile creative is centred inside the existing post width,
with the same spacing, header rhythm and separator. Do not stretch/crop the
creative or disguise it as an author's post; `광고` / `AD` remain visible.

## Publisher configuration

Media: `21st ARK`, `https://21st-ark.dev`, media ID `NJa`.
Three public placement IDs are configured in `apps/frontend/src/adfit.js`:

| Name | Ad unit | Size |
| --- | --- | --- |
| 홈 피드 7개 간격 01 | DAN-OYeMHcjldND26edn | 300 × 250 |
| 홈 피드 7개 간격 02 | DAN-O1A7lkHd8yDKbGHn | 300 × 250 |
| 홈 피드 7개 간격 03 | DAN-2M7vPox6y0K0TXwb | 300 × 250 |

All three have creative auto-refresh disabled. Ad unit IDs are public publisher
configuration, not credentials. Do not call `setKakaoAccountId` or attach blog
account IDs, email, draft content, or application credentials to ad requests.

The media was **pending review** when configured. Real inventory depends on
Kakao's approval and availability. Fewer than seven actual posts produces no
ad request; do not create dummy posts or synthetic impressions to trigger review.

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
  account dialog opens, navigation leaves Home, or the component unmounts.
- Each creative is rendered by the official SDK with the issued dimensions.
  No publisher iframe wrapper: AdFit's policy disallows requesting ads inside
  publisher-created iframes. SDK-created creative frames remain untouched.
- Failure/no-fill removes only that slot. Feed reading, pagination and reactions
  remain available with blocked scripts and network failures.
- CSP allows named Kakao SDK/request/frame hosts; it retains disabled inline
  script attributes, `unsafe-eval` exclusion and frame-ancestor protection.
  Standalone OAuth consent does not allow the advertising SDK.
- Privacy document version `2026-11-20.2` discloses advertising data processing,
  DNT/GPC support, cookie controls and Kakao's privacy/advertising links.

## Verification

`npm run test:adfit` exercises the real App and SDK lifecycle with stubbed
creatives. It verifies cadence across pagination, no replacement of posts,
Home-only placement, single SDK loading, unit leasing/destruction/reuse, no-fill,
hidden tabs, DNT, narrow slots and CSP. It makes no real ad calls or clicks.

Sources: [Web SDK](https://kakaobusiness.gitbook.io/main/partner/adfit/adfit-sdk/web-sdk),
[SDK source](https://t1.kakaocdn.net/kas/static/ba.min.js),
[operating policy](https://adfit.kakao.com/web/html/use_kakao.html).
