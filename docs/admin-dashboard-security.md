# Admin dashboard: deployment na usalama

## Mabadiliko ya sehemu ya admin

Dashboard mpya inategemea Firebase Callable Functions na Firestore rules zilizomo kwenye repository. Kabla ya kupeleka frontend mpya, peleka functions na rules kwanza; vinginevyo frontend mpya itaita endpoints ambazo bado hazijatumika.

Kutoka kwenye root ya repository, ukiwa na Firebase CLI iliyoingia kwenye project sahihi:

```sh
firebase deploy --only functions,firestore:rules
```

Frontend ya GitHub Pages huchapishwa workflow ya Actions baada ya mabadiliko kuunganishwa kwenye `main`. Ujenzi huu wa static haupeleki Cloud Functions wala Firestore rules.

## Sports API key

`SPORTS_API_KEY` ni Firebase Secret Manager secret inayotumiwa tu na Functions zinazohitaji Sports API. Usiweke thamani yake kwenye `VITE_*`, browser storage, commit, au `.env` ya frontend.

Ili kusanidi au kubadilisha key kutoka terminal inayoaminika ya Firebase project:

```sh
firebase functions:secrets:set SPORTS_API_KEY
firebase deploy --only functions
```

Thamani huingizwa na Firebase CLI kwa njia ya siri; dashboard huonyesha hali tu ya “imewekwa/haijawekwa”, si thamani. `SPORTS_API_BASE_URL` si siri na mfano wake uko kwenye `functions/.env.example`.

## Roles na bootstrap ya SUPER_ADMIN

Roles huhifadhiwa kwenye `users/{Firebase Authentication UID}.role`. `USER` ndiye role chaguo-msingi inayoundwa na usajili. Dashboard haitoi role ya `SUPER_ADMIN`, na endpoint ya kubadilisha role inaruhusu `SUPER_ADMIN` pekee kutoa au kuondoa `ADMIN`.

Akaunti ya kwanza ya `SUPER_ADMIN` lazima ianzishwe kupitia njia ya kuaminika ya Firebase Admin SDK au Firebase Console baada ya kuthibitisha UID husika. Usiongeze kitufe au endpoint ya frontend ya kufanya bootstrap hiyo. Callable Functions huthibitisha Authentication UID pamoja na role ya Firestore upande wa server; Firestore rules huzuia clients kubadilisha role zao.

## Data ya dashboard

Mipangilio isiyo siri huhifadhiwa kwenye `siteSettings/main`; sehemu salama kwa wageni iko kwenye `publicSiteContent/main`. Hati ya public haina API key. Matendo ya kiutawala huongezwa na Cloud Functions kwenye `adminActivityLogs`; clients hawawezi kuunda, kuhariri au kufuta rekodi hizo. Mipangilio ya matangazo huonyeshwa kwenye homepage na sheria na masharti yanapatikana `/terms`.

Mabadiliko ya roles, hali ya akaunti, password reset, settings, automatic tickets, sync, tiketi na report export huandikwa kwenye Admin Activity Logs pamoja na UID ya mtendaji na timestamp ya server.
