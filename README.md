# Wazee wa Betting TZ

Jukwaa la Tanzania la betting tips, mikeka na community ya michezo.

## Hali ya sasa

- Dashboard mpya, mobile-first na responsive
- Community picks, mechi za leo, leaderboard na responsible betting guidance
- Ticket builder ya kuanza kuchagua selections na kuhesabu total odds
- Firebase Authentication: namba ya Tanzania na password kupitia flow moja ya React; hakuna Google login
- Cloud Firestore: user profiles na betting drafts
- Firebase Storage: profile image uploads
- Firestore na Storage security rules ziko kwenye `firestore.rules` na `storage.rules`
- Hakuna matokeo ya michezo yaliyobuniwa; sports results zitaingia kupitia API ya server-side

## Phase 1 status

Audit ya architecture na functionality imeandikwa kwenye [`AUDIT.md`](./AUDIT.md). Phase 1 sasa ina registration yenye profile fields kamili, username uniqueness, persistent Firebase session, user profile document na database-enforced roles za `USER`, `ADMIN` na `SUPER_ADMIN`.

## Kuendesha locally

```bash
pnpm install
pnpm run dev
```

## Firebase setup

Firebase web configuration hutumia `VITE_FIREBASE_*` environment variables. Nakili template hii:

```bash
cp .env.example .env.local
```

Kisha hakikisha Firebase Console imewezeshwa:

1. Authentication: Email/Password provider kwa akaunti za simu; hakuna Google provider kwenye UI
2. Firestore Database
3. Storage
4. Rules kutoka `firestore.rules` na `storage.rules`
5. Authorized domain ya production: `steward-tz.github.io`

Firebase web API key si credential ya server; usalama unatokana na Authentication na rules. Usitie service-account private key kwenye frontend.

### Role assignment

Account mpya hupewa `role: "USER"` na user hawezi kubadilisha role yake kupitia client. Kwa account yako ya **SUPER_ADMIN**: fungua Firebase Console → Authentication → Users, nakili UID ya account yako, fungua Firestore → `users` → document yenye UID hiyo, kisha weka field ya string `role` kuwa `SUPER_ADMIN`. Kwa Admin wa kawaida tumia `ADMIN`. Rules ndizo zinazotekeleza access, si jina la username au button ya frontend. Usimpe user wa kawaida write access ya kubadilisha role.

Usihifadhi password kwenye source code, GitHub, Firestore au frontend. Username ya production inapaswa kuwa lowercase letters, numbers au underscore; mfano `steward_tz`.

## Production integrations zinazohitajika

Ili kukamilisha platform ya production kulingana na brief, ongeza backend/database/auth na secrets hizi kupitia hosting provider (usiweke kwenye frontend):

```env
SPORTS_API_KEY=
SPORTS_API_BASE_URL=
DATABASE_URL=
AUTH_SECRET=
```

Sports API service inapaswa kuhifadhi `event_id`, league/team IDs na match time kabla ya settlement engine ku-settle selections. Status ya WON/LOST haipaswi kuwekwa bila final result kutoka source hiyo.

## Automatic ticket generator

Cloud Function `generateAutoTicket` hukimbia kila dakika 30. Kila selection ya auto-ticket lazima iwe na odds halisi za Sports API kati ya `1.40` na `1.80`, odds ziwe fresh ndani ya cache ya saa 6, na ticket iwe na selections 2–5. GitHub Actions daily generator hutumia ukaguzi huohuo. Ikiwa hakuna selections zinazokidhi vigezo, hakuna ticket inayochapishwa. Mfumo hauahidi ushindi na haupost kwenye bookmaker; unachapisha kwenye feed ya website pekee.

Cloud Function `generateAiPredictions` hukimbia kila saa 6. Inalinganisha implied probability ya odds za API na form ya hadi mechi 5 za mwisho za kila timu, iliyohifadhiwa kwenye cache ya saa 12. Prediction huundwa tu ikiwa timu zote zina angalau matokeo 3 yaliyokamilika, odds ni fresh na chaguo liko ndani ya odds `1.40–1.80`. Confidence ni makadirio ya mchanganyiko wa soko na form, si uhakikisho wa ushindi. Prediction, sababu na odds snapshot huhifadhiwa kwenye match record; matokeo huwekewa `WON`/`LOST`/`VOID`/`CANCELLED` baada ya score rasmi kuthibitishwa na API. Ukurasa wa Ratiba unaonyesha prediction feed, historia na accuracy iliyohesabiwa kwa `WON` na `LOST` pekee.

Ili automation ifanye kazi production, weka `SPORTS_API_KEY` kwenye GitHub Actions secret ya functions, deploy Cloud Functions, kisha hakikisha scheduler ya Firebase imewezeshwa. Telegram, WhatsApp au social posting ni integration tofauti na inahitaji channel moja ichaguliwe pamoja na credentials/idhini zake.
