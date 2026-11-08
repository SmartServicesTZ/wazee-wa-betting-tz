# Auto Tickets kupitia GitHub Actions

## Muhtasari

Auto Tickets zinaendeshwa na workflow ya `.github/workflows/auto-ticket.yml` kwenye GitHub-hosted runner. Workflow hutumia script `functions/scripts/auto-ticket.mjs` na Firebase Admin SDK pekee; hai-deploy wala kuita Firebase Cloud Functions, na haihitaji Cloud Build au Artifact Registry kwa kazi hii.

Workflow imepangwa mara nne kwa siku: dakika ya 17 katika saa 00:00, 06:00, 12:00 na 18:00 UTC (03:17, 09:17, 15:17 na 21:17 kwa saa za Tanzania). Pia ina `workflow_dispatch`, ambayo ni run ya moja kwa moja na inaweza kuchapisha tiketi ya umma; usiianzisha kama hutaki matokeo mapya ya production.

## Secrets zinazohitajika

Weka hizi katika GitHub repository Settings → Secrets and variables → Actions:

- `FIREBASE_SERVICE_ACCOUNT` (au jina la zamani `FIREBASE_SERVICES_ACCOUNT`): JSON ya service account yenye ruhusa za kusoma/kuandika Firestore collections zinazohitajika na runner. Script hukataa key ambayo `project_id` si `wazee-wa-betting-tz-e7183`.
- `SPORTS_API_KEY`: key ya Sports API, inayotumiwa server-side tu.
- `SPORTS_API_BASE_URL`: ya hiari; msingi wa kawaida ni `https://v3.football.api-sports.io`.

Usiweke key hizi kwenye source code, frontend, au logs.

## Guardrails na usalama wa data

Kila selection inayochaguliwa lazima iwe na odds kati ya **1.40 na 1.80, ikijumuisha mipaka yote miwili**. Script inakagua range kabla ya kuandika ticket na inakagua tena ticket iliyosomwa kutoka Firestore. Verification pia inahakikisha idadi ya selections ni 2–5 na odds zinalingana na snapshot safi ya API.

Workflow ina concurrency group kuzuia runs kuingiliana na fingerprint/window checks kuzuia duplicate tickets. Odds API requests zimepunguzwa kwa fixtures chache kwa kila tarehe ili kuheshimu quota. Logs huandikwa `api_logs`.

Workflow haifuti data. Ikiwa ticket inayopatikana kupitia duplicate-fingerprint au ukaguzi wa window ya sasa itashindwa verification, run itaashiria failure; ticket haitafutwa wala kurekebishwa kimyakimya. Tiketi nyingine za zamani zenye odds nje ya range zinahitaji uamuzi tofauti wa admin kabla ya kufichwa/ku-archive.

## Gharama na mipaka

Njia hii haitegemei Firebase Cloud Functions, Cloud Build API au Artifact Registry, na haibadilishi Firebase billing. GitHub Actions na Sports API bado zina limits/quotas zao; workflow imewekwa mara nne kwa siku na inatumia API quota ndogo kwa kila run.
