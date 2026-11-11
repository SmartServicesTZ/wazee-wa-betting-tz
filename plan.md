# Wazee wa Betting TZ — Frontend redesign

## Approach

Redesign hii inatumia design system moja ya mobile-first kwenye routes zilizopo. Branch hii imeanzia kwenye `origin/main` ya sasa na imebeba commit ya frontend redesign pekee; PR #7 ya live scores imeachwa tofauti na OPEN. Data, Firebase Auth, Firestore schema, Cloud Functions, routes, security rules na deployment config hazibadilishwi.

## Design direction

Chosen direction ni light-first matchday editorial: soft green canvas, white surfaces, green action color, typography ya Manrope/Space Grotesk, match cards zenye league eyebrow na pill metadata kwa risk/odds/status. Dark/night-match theme inapatikana kwa toggle ya mtumiaji na preference huhifadhiwa locally. Layout ni responsive, touch-friendly na inaheshimu reduced motion.

## Preserved functionality

Existing homepage, matches, community, ticket builder, ticket details, leaderboard, profile, login/register na protected admin flows zimehifadhiwa. Existing API/Firebase data pekee ndiyo inaonekana; hakuna fixtures, odds, scores, user content au payment state ya kubuni inayowasilishwa kama live.

## Files

- `src/components/app-shell.tsx`: global navigation na persistent theme toggle.
- `src/styles.css`: light-first visual system, dark theme variables na route-wide responsive surfaces.
- `src/routes/*`: existing page flows preserved.
- `public/manus-routes.json`: existing route manifest.

## Stage 2 direction

Baada ya approval ya branch safi, ongeza Marketplace preview, Community profile/follow polish, Seller Center demo, User Account surfaces na Wallet read-only demo kama UI-only additions. Purchase/earnings/withdrawal controls zibaki DEMO/DISABLED mpaka backend/payment approvals zipatikane. Hakuna production deployment mpaka approval ya Project Lead.
