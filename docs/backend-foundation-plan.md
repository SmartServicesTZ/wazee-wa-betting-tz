# Wazee wa Betting TZ — Manus 3 backend audit and foundation plan

**Tarehe:** 11 Novemba 2026
**Base ya audit:** `origin/main` — `d21561b46c5e9e0362dbd57ec28a03ec4ce5fa73`
**Branch ya kazi:** `manus3/backend-foundation`
**Scope:** source review, publicly available provider/platform documentation, and local Firebase Emulator tests. No production Firebase data or settings were changed.

## Matokeo ya audit

### Mfumo uliopo

Frontend ni TanStack Start/React inayochapishwa kama static site kupitia GitHub Pages. Firebase Authentication, Cloud Firestore na Firebase Storage zinatumika kutoka browser. Firebase project alias iliyoko kwenye repository ni `wazee-wa-betting-tz-e7183`; hiyo ni project target ya code, si uthibitisho wa deployed state. Cloud Functions source tayari ina admin callables, notification triggers, virtual-coin operations, sports sync, prediction/settlement logic na schedules. GitHub Actions pia zina daily auto-ticket generation na live-score sync. Kwa hiyo mfumo si “frontend tupu”; backend code ipo, lakini deployment na configuration yake ya production hazijathibitishwa.

`AUDIT.md` ya repository ni ya 1 Oktoba 2026. Maelezo yake kuwa hakuna admin dashboard, feed au ticket database yamepitwa na `origin/main`. Sikupata faili tofauti inayoitwa Manus 1 audit; tumia `AUDIT.md` kama kumbukumbu ya zamani, si kama hali ya sasa. Remote Manus/community branches zilizokaguliwa hazikuwa na marketplace/seller/orders UI.

### Data model iliyopo

Code inatumia `users/{uid}`, `publicProfiles/{uid}`, `usernames/{username}`, `tickets/{ticketId}` na `tickets/{ticketId}/selections/{selectionId}`. Community relations zilizopo ni `likes`, `comments`, `followers`, `savedTickets`, `notifications` na `reports`. Admin logs zina majina mawili, `adminAudit` na `adminActivityLogs`. Virtual-coin wallet hutumia `coinBalances`, `coinTransactions` na `coinSettings`. `payments` na `subscriptions` zinasomwa na admin UI, lakini source iliyokaguliwa haithibitishi checkout ya marketplace wala real-money payment workflow.

Marketplace yenye seller applications, listings, orders/purchases na seller ratings haipo kwenye source ya sasa. Pia sikuona purchased-ticket entitlement au order lifecycle. Hivyo hii ni capability mpya, si kuunganisha UI kwenye collection iliyopo.

### Security na integrity findings

Admin callables nyingi zina `assertAdmin` ya server-side inayosoma role ya mtumiaji. Mabadiliko ya role na baadhi ya coin settings yanahitaji `SUPER_ADMIN`. Hizi ni guardrails muhimu, lakini lazima backend iwe deployed ili zitekelezwe kwa request za live.

Firestore rules za `users/{uid}` zinazuia role escalation ya moja kwa moja, lakini owner update haijawekewa allowlist ya fields. Hivyo user anaweza kubadilisha fields nyingine za profile/statistics zinazofanana na authoritative data. Ticket creation rule inathibitisha `creatorId`, status `PENDING` na `totalOdds > 0` pekee; haina field allowlist, bounds za odds/text/selections au schema enforcement. Authenticated user anaweza kuunda report yenye fields/payload isiyozuiliwa zaidi ya ownership check. Mabadiliko ya rules yanahitaji compatibility review kwa client writes zote kabla ya deployment.

Ticket reads zinafunga visibility ya `PRIVATE` na nested selections kwa owner/admin; emulator tests mpya zimehakiki hili. Storage rules zinafunga object paths kwa owner na size chini ya 5 MiB pamoja na content-type `image/*`, lakini content-type ni metadata inayotolewa na caller. Picha za profile pia hupitia Cloudflare `workers.dev` URL iliyo hard-coded kwenye client; hakuna Worker source/config katika repository, kwa hiyo token verification, UID/path binding, content inspection, CORS na rate limiting haviwezi kuthibitishwa. Firebase Storage rules hazilindi endpoint hiyo.

Registration hutumia phone-derived synthetic email na username inayotokana na namba ya simu. Username-to-UID mapping ni public-readable; tathmini faragha ya muundo huo kabla ya kubadilisha registration. Profile counters zinarudiwa kwenye private na public profile, na server settlement huzi-update. Ticket na selection client writes si zote atomic; retries/partial failures zinaweza kuacha records zisizokamilika. Scheduled settlement pia inahitaji tests za retry/concurrency.

### Production deployment na live data

GitHub Actions `Sync live football scores` ya main iliyokamilika 11 Novemba 2026 15:34 UTC ilifanikiwa kwa SHA hii. Log yake inaonyesha API requests 1, fixtures 200 zilizopokelewa, 15 zilizosasishwa, 14 zikiwa live, moja completed/rescheduled, na zero malformed. Hii inathibitisha kuwa workflow hiyo iliingiza live fixtures kwa run hiyo; haithibitishi kwamba frontend query au data ya kila user inaonyesha mechi zote.

GitHub Pages deployment ya main pia ilikuwa na run iliyofanikiwa. `Deploy Firebase Backend` ya 11 Novemba 11:33 UTC ilishindwa: log inasema credentials za workflow hazina ruhusa ya kuwasha Cloud Build API kwenye project. Log pia ilionyesha missing-secret checks kwa majina `FIREBASE_SERVICE_ACCOUNT` na `SPORTS_API_KEY`. Thamani za secrets hazikusomwa. Hali ya Firebase Console, deployed rules/functions, schedules, Auth settings, billing, quotas, indexes na data halisi haikuthibitishwa. User ameeleza project iko Spark; hilo halikuthibitishwa moja kwa moja kwa Console/API.

## Pendekezo la architecture bila billing ya Firebase

Firebase pricing documentation inaonyesha Cloud Functions kama Blaze-only capability; Blaze huhitaji billing account. Spark ina no-cost Firebase usage lakini haitoi guarantee kwamba Functions deployment/scheduled workloads zitaendelea bila billing. Kwa hiyo tusijaribu tena deploy ya Functions, kuwasha APIs, kubadili billing au kutengeneza service-account secrets bila owner approval na makubaliano ya gharama. [1] [2]

Kwa sasa, hifadhi Firebase kama Auth/Firestore data plane na GitHub Actions kama scheduled pipeline iliyopo. Actions zinaweza kuendelea kusawazisha fixtures na kutengeneza auto tickets pale credentials na provider quota vinapokuwepo. Hata hivyo Actions si user-facing trusted API: usiweke sports API keys kwenye browser, na usitegemee direct client writes kwa orders, commissions, contest scoring au admin mutations.

Cloudflare Worker inaweza kuwa free-tier bridge ya request/response API pale no-billing requirement inapotawala. Free plan ina 100,000 requests/day, 10 ms CPU kwa request na hadi 50 subrequests; Free inapatikana default, wakati Workers Paid ni kuanzia US$5/month. Network wait haijumuishwi kwenye CPU time. Hizi ni Cloudflare limits, si Firebase quotas. [3] [4] Usihamishe backend yote: repository tayari ina Firebase Functions domain logic, na Worker ya image upload inayotajwa na frontend haina source yake hapa. Worker inayotakiwa kuandika privileged Firestore data inahitaji authorization na credential architecture iliyothibitishwa. Client Firebase ID token lazima ithibitishwe backend-side; Firebase Admin SDK verification huhitaji service-account credentials. [5]

Mwelekeo salama ni kuanza na endpoints nyembamba za HTTP/Worker bila kuandika privileged Firestore state; au kutumia Firebase callable functions baada ya billing/API/deployment prerequisites kukubaliwa. Kwa privileged operations, tumia trusted backend na transaction/idempotency. Hakuna payment processor, payout au cash balance inayopendekezwa katika phase hii.

## Schema proposal ya nyongeza

Schema hizi ni mapendekezo tu; hakuna collection mpya iliyoundwa. Tumia Firestore transactions/idempotency, versioned field contracts na server timestamps. Clients zisitume trusted status, balances, review totals au commission amounts.

- `sellerApplications/{uid}`: `applicantUid`, profile snapshot/reference, `status` (`PENDING`, `APPROVED`, `REJECTED`), `submittedAt`, `reviewerUid`, `reviewedAt`, `reasonCode`. Applicant anasoma ombi lake; reviewer/admin pekee hubadilisha status.
- `marketListings/{listingId}`: `sellerUid`, ticket reference, immutable ticket snapshot, `title`, `description`, `status` (`DRAFT`, `ACTIVE`, `RESERVED`, `SOLD`, `WITHDRAWN`), currency label inayoonekana wazi kuwa demo-only ikiwa inatumika, integer `demoAmount`, `createdAt`, `updatedAt`, `schemaVersion`. Usireuse `tickets` kama listing state.
- `marketOrders/{orderId}`: `buyerUid`, `sellerUid`, `listingId`, immutable listing/ticket snapshot, demo-only amount, `status`, `idempotencyKey`, `createdAt`, `completedAt`/`cancelledAt`. Order creation/reservation lazima iwe atomic na listing status; buyer hawezi kubadilisha `status` au receipt fields moja kwa moja.
- `marketReviews/{orderId}`: one review per eligible completed order, `buyerUid`, `sellerUid`, `rating` integer 1–5, bounded text, `createdAt`, moderation state. Server checks order completion, buyer ownership and no self-review; aggregate rating is derived, not client supplied.
- `freeContests/{contestId}` na `freeContestEntries/{contestId_uid}`: terms/version, open/close times, eligibility, bounded entry, scoring version, result state, unique entry ID, deterministic result calculation and audit linkage. No cash prize or purchase link unless a separately approved legal/payment design exists.
- `demoLedger/{entryId}` is optional only if a demo marketplace credit is approved: append-only, integer positive amount, debit/credit direction, order/listing reference, `idempotencyKey`, `createdAt`. Isolate it from real-money payments and existing `coinBalances`/`coinTransactions`. The existing virtual coin wallet must not be described as cash.
- Reuse the existing `notifications` collection for event alerts after validating its intended query/read lifecycle. Do not create a competing alert collection. Standardize `adminAudit` versus `adminActivityLogs` before widening moderation or order operations.

## API/domain boundaries to implement later

Existing functions include admin auth/config, ticket creation, virtual coin operations, sports sync and settlement. New marketplace operations should be separate, bounded authenticated endpoints: `submitSellerApplication`, `reviewSellerApplication`, `createListing`, `updateListing`, `withdrawListing`, `createDemoOrder`, `cancelDemoOrder`, `getMyOrders`, and `leaveSellerReview`. Contest operations can be `createFreeContest`, `joinFreeContest` and `submitFreeEntry`; result calculation remains trusted server logic. Every mutation must validate actor/role, ownership, state transition, payload allowlist/size, timestamps and idempotency. Commission/payout APIs and real-money orders are out of scope until the owner decides to fund and operate payments compliantly.

## Tests added and still needed

Branch now adds `@firebase/rules-unit-testing` 5.0.2, compatible with the repository's Firebase 12 SDK and Node 22. `pnpm test:rules` runs the Firestore Emulator under demo project ID `demo-wazee-rules`; it does not authenticate to or write to the production project. Five emulator tests passed: own USER profile creation, rejecting admin-role creation, rejecting self role escalation, public/private ticket visibility, and private selection visibility. CI runs this command for pull requests through `validate-rebuild.yml`.

Before changing production rules, add tests for user/admin field allowlists, server-owned counters, report payload bounds, likes/comments/follows/saved ticket ownership, notification reads, admin/SUPER_ADMIN role checks, disabled accounts, ticket/selection state transitions and delete behavior. Add Storage Emulator tests for owner boundaries, size, content type and the separate upload Worker. Domain unit/integration tests should cover listing ownership, seller review eligibility, duplicate orders/idempotency, reservation races, contest cutoffs/scoring, moderation, retries and partial settlement failure. The five current tests establish selected existing boundaries; they do not fix the broader rule gaps above.

## Sources

Repository statements above refer to pinned `origin/main` SHA `d21561b46c5e9e0362dbd57ec28a03ec4ce5fa73`, particularly `firestore.rules`, `storage.rules`, `src/lib/firebase.ts`, `src/lib/firestore.ts`, `functions/src/index.ts`, `firebase.json`, `.firebaserc`, `.github/workflows/deploy-functions.yml`, `.github/workflows/deploy-pages.yml`, `.github/workflows/sync-live-scores.yml` and `.github/workflows/validate-rebuild.yml`.

[1]: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans "Firebase pricing plans"
[2]: https://firebase.google.com/pricing "Firebase pricing"
[3]: https://developers.cloudflare.com/workers/platform/limits/ "Cloudflare Workers limits"
[4]: https://developers.cloudflare.com/workers/platform/pricing/ "Cloudflare Workers pricing"
[5]: https://firebase.google.com/docs/auth/admin/verify-id-tokens "Verify Firebase ID tokens"
