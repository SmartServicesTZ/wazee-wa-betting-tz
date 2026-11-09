# Wazee wa Betting TZ — BetWall expansion

## Approach

Tutaendeleza app iliyopo ya Firebase/API-Football kwa kuongeza BetWall navigation na discovery pages bila kubadilisha Firebase project, credentials, Firestore security model, au kutengeneza betting data ya kubuni. Navigation itatumia data ya user/profile halisi pale inapatikana; cards, probabilities, ROI, rankings na standings zitaonyesha data ya Firestore/API pekee, au empty state inayoeleza kwa nini data haipo.

## Design

- **Style options:** BetWall matchday console (0.05); social sports bulletin (0.07); premium odds ledger (0.04).
- **Chosen movement:** BetWall matchday console — sidebar yenye profile rail, compact feed cards na status colors zinazoeleweka bila kupotosha odds/results.
- **Core principles:** data halisi kwanza; navigation ipatikane kwa thumb; status iwe wazi; hakuna sample balance/statistics; desktop sidebar ibadilike kuwa drawer ya simu.
- **Color philosophy:** navy/charcoal ya sasa inabaki msingi; lime ni action/focus; green ni WON pekee; red ni LOST/risk; blue ni information na language/table controls.
- **Layout paradigm:** persistent left navigation kwenye desktop, overlay drawer kwenye simu, na feed yenye filters/tab bar badala ya grids zisizo na hierarchy.
- **Signature elements:** profile balance rail, OPEN/WON/LOST status tabs, na league country rows zenye flags na chevron.
- **Interaction:** sidebar ifunguke/kufungwa kwa button yenye aria-label; links za data ambazo hazijapatikana zionyeshe empty state badala ya dead-end; reduced motion iheshimiwe.
- **Typography:** Manrope kwa body, Space Grotesk kwa headings/brand, DM Mono kwa odds na coin values.
- **Brand essence:** kitovu cha mikeka, data za soka na jamii ya Tanzania; makini, wazi, ya kuaminika.
- **Brand voice:** “Chagua kwa taarifa. Cheza kwa uwajibikaji.” na “Hakuna data halisi, hakuna namba ya kubuni.”

## Project structure

- `src/components/app-shell.tsx`: global shell, profile rail, desktop sidebar, mobile drawer na menu groups.
- `src/routes/community.tsx`: public coupon feed ya Firestore yenye status filters na existing engagement actions.
- `src/routes/languages.tsx`: language selection page yenye options za UI; preference huhifadhiwa locally bila kudai translation ambayo haijatekelezwa.
- `src/routes/point-tables.tsx`: point tables browser inayosoma standings kutoka Firestore/API cache; empty state ikiwa provider bado hajatoa standings.
- `src/routes/users/$username.tsx`: public profile, period stats na ranking/ROI fields pale backend imezihifadhi.
- `src/lib/firestore.ts`: typed read helpers za public profiles, followers na standings.
- `src/styles.css`: sidebar, drawer, feed tabs, language rows na standings rows.
- `public/manus-routes.json` na `src/routeTree.gen.ts`: route declarations synchronized with new pages.

## Data boundaries

- User balance/coins: soma `bwCoins`/`coins` iliyopo; ikiwa haipo, onyesha `—` na “haijapatikana”, si 1,000.00 ya mfano.
- Coupon probabilities, ROI na rankings: soma fields zilizohifadhiwa na server settlement; frontend haitakokotoa au kuonyesha sample values.
- Point tables: soma `standings` cache ya provider; implementation haitajaza teams/points bila API result.
- Language list ni static product configuration, si user/statistical data.
