# Wazee wa Betting TZ — Frontend redesign

## Approach

Redesign hii inatumia design system moja ya mobile-first kwenye routes zote zilizopo. Data, Firebase Auth, Firestore schema, Cloud Functions, routes na deployment config hazibadilishwi. Mabadiliko yamejikita kwenye `src/styles.css`, shell/navigation, accessibility polish, na route manifest ya static preview.

## Design

- **Style options:** Matchday editorial (0.06); dark sports terminal (0.04); community bulletin (0.08).
- **Chosen movement:** Matchday editorial — premium sports product yenye hierarchy ya magazeti ya mechi, panels za compact na accents za ushindani.
- **Core principles:** taarifa muhimu ionekane haraka; controls ziwe touch-friendly; content halisi pekee ndiyo ionekane; consistency kati ya home, community, ticket details, profile na admin.
- **Color philosophy:** charcoal/navy hujenga uaminifu na kusomeka vizuri; lime ni signature action/status color; teal ni supporting data color; hakuna rainbow palette.
- **Layout paradigm:** featured horizontal match rail, asymmetric hero kwenye desktop, stacked content kwenye simu, na floating bet slip inayobaki karibu na thumb.
- **Signature elements:** lime signal line, match cards zenye league eyebrow, na pill metadata kwa risk/odds/status.
- **Interaction:** selected odds, active tabs, focus rings na hover states zionyeshe mabadiliko bila animation nzito; reduced-motion iheshimiwe.
- **Typography:** Manrope kwa body, Space Grotesk kwa headlines/brand; hierarchy yenye line-height pana kwa Kiswahili.
- **Brand essence:** kitovu cha mikeka na jamii ya michezo Tanzania; wazi, makini, ya jamii.
- **Brand voice:** “Chagua kwa taarifa. Cheza kwa uwajibikaji.” na “Mikeka ya jamii, data halisi.”

## Project structure

- `src/components/app-shell.tsx`: global navigation, account entry na mobile navigation.
- `src/routes/*`: existing page flows and Firebase-backed interactions preserved.
- `src/styles.css`: single source of truth for visual system, responsive breakpoints and accessibility.
- `public/manus-routes.json`: route manifest for preview tooling and deep-link verification.
