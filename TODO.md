# BetWall expansion TODO

## Navigation na profile rail
- [ ] App shell iwe na profile header juu ya sidebar yenye picha ya user, display name/username, balance ya coins/points kutoka profile halisi, na link ya account; ikiwa balance haipo ionyeshe `—` badala ya sample balance.
- [ ] Desktop iwe na side navigation na simu iwe na drawer/overlay yenye close button, keyboard focus na touch targets; links zote ziende kwenye route inayofanya kazi au empty state inayoeleza feature haijapata data.
- [ ] Menyu ibebe Betting Tips, Coupons, Risk Coupons, Betswall VIP, Make Coupon, Live Scores, Buy bwCoin, Watch Video Win bwCoin, Remove Ads, My Coupons, My Wall, Best Tipsters, From Top Users, Most Played, Correct Score, Draw, HT/FT, Last Match, Goal Videos, Open/Won Bombs, Hot Coupons, Point Tables, Notifications, Language, Follow/Share Betwall, Tutorial, How to Win na Contact Us bila kudai functionality ambayo backend haijajenga.

## Coupons feed
- [ ] Feed ya coupons itumie tickets za umma kutoka Firestore pekee na ionyeshe creator identity, country flag/team identity pale fields zipo, kickoff, teams, choice/market, odds na status.
- [ ] Feed iwe na tabs OPEN, WON na LOST; statuses zitoke settlement ya backend na zisibuniwe frontend.
- [ ] Coupon card ionyeshe total odds, stake/potential win/probability/ROI pale fields hizo zimetolewa na backend; data ikikosekana ionyeshe `Haijapatikana` badala ya namba ya mfano.
- [ ] Like, share na BET NOW/angalia ticket ziendelee kutumia existing Firebase-backed actions na responsible-betting copy.

## Profiles na rankings
- [ ] Public profile ionyeshe followers/following, tickets, won/lost/pending, win rate, ROI na pie breakdown kwa data ya Firestore iliyosettle pekee.
- [ ] World ranking iwe na periods za saa 24, siku 7 na siku 30; period isiyo na data ionyeshe empty state, si ranking ya kubuni.

## Language na point tables
- [ ] Language page iwe na English, Türkçe, Deutsch, Italiano, Français, Español, Português, Kiswahili, Русский, العربية, 中文, Nederlands, فارسی, 한국어, Bahasa Indonesia, हिन्दी, বাংলা na ภาษาไทย pamoja na flag/label na selected check.
- [ ] Preference ya lugha ihifadhiwe bila kuvunja Kiswahili cha sasa; tafsiri ambazo hazijatekelezwa zisionekane kama zimekamilika.
- [ ] Point Tables page ionyeshe International na nchi/associations zilizo kwenye provider standings cache; rows zifunguke kuona table kamili na zionyeshe empty state ikiwa API haijatoa standings.

## Data integrity na validation
- [ ] Usitumie fake fixtures, fake odds, fake results, fake balances, fake probabilities, fake ROI, fake followers, au fake standings.
- [ ] Usibadilishe Firebase project `wazee-wa-betting-tz-e7183`, Firestore schema/rules, deployment secrets, au repository ya Huduma za Mtandaoni.
- [ ] Production build, function tests, route manifest verification na live smoke tests zipite; lint debt iliyopo iwe wazi bila kuficha errors.
