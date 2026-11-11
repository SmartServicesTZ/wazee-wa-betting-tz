# Redesign TODO

## Visual system across the application

- [x] Homepage, Mechi, Jamii, Tengeneza mkeka, ticket details, leaderboard, profile, login/register na admin zitumie visual system moja mpya badala ya overrides zilizorundikana.
- [x] Tumia light-first palette ya soft green/white yenye night-match dark theme ya kuchagua; typography, spacing, buttons, cards na controls ziwe consistent.
- [x] Interface ibaki ya Kiswahili isipokuwa istilahi za mfumo zinazohitajika.

## UX and accessibility

- [x] Navigation iwe wazi desktop na mobile, pamoja na focus states, labels, contrast na touch targets zinazofaa.
- [x] Loading, error na empty states ziwe na muonekano unaoeleweka bila kuacha nafasi tupu.
- [ ] Responsive layouts zikaguliwe kwenye takriban 375px, 768px na 1440px bila overflow au controls kufunikana.

## Existing functionality and integrations

- [x] Hifadhi Firebase Auth, Firestore, Cloud Functions, existing routes/deep links, match filters, create-ticket flow, profiles, leaderboard, admin na community actions.
- [x] Like, comments, sharing, login/register na responsible-betting disclaimer viendelee kufanya kazi; data/odds/user content zisitengenezwe kwa kubuni.
- [x] Usibadilishe Firestore schema, rules, credentials, Firebase project au deployment secrets.

## Validation and handoff

- [x] Production build imepita.
- [x] Prettier checks na targeted ESLint checks zimepita.
- [ ] Full lint ya repository ipite; kwa sasa ina legacy issues kwenye routes ambazo hazikubadilishwa.
- [ ] Tengeneza screenshots za 375px, 768px na 1440px kwa routes kuu.
- [ ] Thibitisha admin dashboard kwa account yenye ruhusa bila kubadili authorization/security.
- [ ] Commit mabadiliko kwenye branch mpya na fungua Pull Request bila ku-merge au ku-deploy.

## Stage 2 — product UI

- [ ] Marketplace preview/listing UI yenye purchase buttons zilizoandikwa DEMO.
- [ ] Community profile/follow/trending UI polish bila kubadili backend contracts.
- [ ] Seller Center application/listings/sales demo UI.
- [ ] User Account, saved/purchased tickets demo na notifications UI.
- [ ] Wallet demo/read-only UI yenye ujumbe wazi kuwa real-money wallet haijawezeshwa.
