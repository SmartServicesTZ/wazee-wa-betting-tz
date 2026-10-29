# Wazee wa Betting TZ — Project Audit

## Audit ya tarehe 2026-10-01

### Architecture iliyopo

- **Frontend:** TanStack Start, React 19, Vite na Tailwind CSS.
- **Deployment:** GitHub Pages; workflow huchapisha SSR HTML na assets za React/TanStack Start pekee. Hakuna vanilla auth client ya pili inayopindua routes za React.
- **Backend server:** Hakuna backend server iliyowekwa kwenye repository hii.
- **Database/Auth:** Firebase Authentication, Cloud Firestore na Firebase Storage.
- **Build:** `pnpm run build`; GitHub Actions workflow ya `.github/workflows/deploy-pages.yml`.
- **Environment:** `.env.example` ina Firebase Web config keys; hakuna server-side Sports API key.

### Kilichothibitishwa kufanya kazi

- Firebase Email/Password Auth client flow
- Firebase Google sign-in client flow
- Firebase logout na persistent browser session kupitia `onAuthStateChanged`
- Firestore user profile write na betting draft write
- Storage profile image upload helper
- Live Firebase module loading kwenye GitHub Pages
- Firestore/Storage rules files zipo kwenye repo

### Kilichokuwa UI/demo au hakijathibitishwa production

- Homepage tickets na matches zilitoka kwenye arrays za hard-coded ndani ya `src/routes/index.tsx`.
- Hakukuwa na real ticket collection/feed query.
- Hakukuwa na registration fields kamili, username uniqueness au role profile enforcement.
- Hakukuwa na admin route/dashboard wala admin CRUD.
- Hakukuwa na sports API, results ingestion au settlement engine.
- Hakukuwa na likes, comments, follows, reports au profile pages za database.
- Routes zilizopo ni portal routes; routes za `/login`, `/register`, `/create-ticket`, `/admin` na `/users/:username` hazikuwepo.
- Sports API secrets na server-side validation hazikuwepo.

## Phase 1 iliyotekelezwa sasa

- Registration ina first name, last name, username, email, phone, password na confirm password.
- Validation ya required fields, username format/length, phone format, password length na password confirmation.
- Username uniqueness kupitia `usernames/{username}`.
- User profile document ina `role: USER` na fields za profile.
- Firestore rules zina role checks za `USER`, `ADMIN` na `SUPER_ADMIN`.
- Owner checks zinazuia user kubadilisha profile/role ya mtu mwingine.
- Admin/Super Admin access imeandaliwa kwa database rules; role assignment ifanyike Firebase Console au trusted admin tooling, si frontend.
- Session inaendelea baada ya refresh kwa Firebase Auth persistence.

## Roadmap inayofuata

1. **Phase 2:** user dashboard, profile route na profile statistics kutoka database.
2. **Phase 3:** Sports API server-side integration, matches/leagues/teams/results collections.
3. **Phase 4:** create-ticket builder yenye real match selections na immutable odds snapshot.
4. **Phase 5:** publish tickets, public feed, likes, comments, follows, saves na reports.
5. **Phase 6:** results ingestion na automatic settlement engine.
6. **Phase 7:** calculated statistics kutoka settled selections.
7. **Phase 8:** protected admin dashboard na CRUD.
8. **Phase 9:** security review, validation, rate limits, logs na abuse controls.
9. **Phase 10:** end-to-end testing, mobile testing, browser/network verification na production deployment.

## Muhimu kuhusu production

GitHub Pages ni static hosting. Firebase Auth/Firestore/Storage zinaweza kufanya kazi browser-side, lakini Sports API keys, scheduled result ingestion, settlement jobs na admin trusted operations zinahitaji server-side runtime (kwa mfano Cloud Functions/Cloud Run/Cloudflare Worker). Hazipaswi kuwekwa kwenye frontend.
