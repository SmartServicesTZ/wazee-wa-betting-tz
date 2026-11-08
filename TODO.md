# Redesign TODO

## Visual system across the application
- [ ] Homepage, Mechi, Jamii, Tengeneza mkeka, ticket details, leaderboard, profile, login/register na admin zitumie visual system moja mpya badala ya overrides zilizorundikana.
- [ ] Tumia palette ya navy/charcoal yenye accent moja ya lime; typography, spacing, buttons, cards na controls ziwe consistent.
- [ ] Interface ibaki ya Kiswahili isipokuwa istilahi za mfumo zinazohitajika.

## UX and accessibility
- [ ] Navigation iwe wazi desktop na mobile, pamoja na focus states, labels, contrast na touch targets zinazofaa.
- [ ] Loading, error na empty states ziwe na muonekano unaoeleweka bila kuacha nafasi tupu.
- [ ] Responsive layouts zikaguliwe kwenye takriban 375px, 768px na 1440px bila overflow au controls kufunikana.

## Existing functionality and integrations
- [ ] Hifadhi Firebase Auth, Firestore, Cloud Functions, existing routes/deep links, match filters, create-ticket flow, profiles, leaderboard, admin na community actions.
- [ ] Like, comments, sharing, login/register na responsible-betting disclaimer viendelee kufanya kazi; data/odds/user content zisitengenezwe kwa kubuni.
- [ ] Usibadilishe Firestore schema, rules, credentials, Firebase project au deployment secrets.

## Validation and handoff
- [ ] Production build, lint na checks zinazopatikana zipite.
- [ ] Tengeneza screenshots za 375px, 768px na 1440px kwa routes kuu.
- [ ] Commit mabadiliko kwenye branch mpya na fungua Pull Request bila ku-merge au ku-deploy.
