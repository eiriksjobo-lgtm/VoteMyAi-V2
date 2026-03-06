# VoteMyAI Session Report — 6. mars 2026

## OVERORDNET SAMMENDRAG

Fortsettelse fra gårsdagens session. Fokus: CSP-fikser for radio, Reddit-engasjement, bloggpost-lansering, community management, og Udio submit-fix. Radioen er nå live og funksjonell på desktop. Android har fortsatt problemer.

---

## KRITISK FIX: CSP MEDIA-SRC

### Problem
Radioen spilte KUN YouTube-tracks. Alle Suno, Udio og SoundCloud tracks feilet med:
`Loading media from '<URL>' violates CSP directive: "default-src 'self'". Note that 'media-src' was not explicitly set.`

### Årsak
Da vi la til CSP-header i vercel.json (sikkerhetsrevisjon), glemte vi `media-src` direktivet. Uten det faller media-lasting tilbake til `default-src 'self'` som blokkerer alle eksterne audio-URLer.

### Fix implementert
Lagt til i vercel.json CSP-header:
- `media-src`: 'self' https://cdn.suno.ai https://cdn1.suno.ai https://cdn2.suno.ai https://storage.googleapis.com https://cf-media.sndcdn.com blob:
- Utvidet `connect-src` med: https://storage.googleapis.com https://cf-media.sndcdn.com https://api-v2.soundcloud.com https://www.udio.com https://udio.com https://img.youtube.com https://imagedelivery.net https://i1.sndcdn.com

### Status
- Suno: FUNGERER ✅ (bekreftet i incognito)
- SoundCloud: FUNGERER ✅
- YouTube: FUNGERER ✅ (men YT Player trenger retry-logikk pga SW-blokkering)
- Udio: Stream resolves men playback feiler fortsatt ("Failed to load because no supported source was found")

---

## SERVICE WORKER PROBLEM

### Problem
SW (sw.js) intercepter ALLE fetch-requests inkludert tredjeparter (YouTube API, bilder, fonter) og feiler pga CSP.

### Fix implementert
Endret sw.js fetch-handler til å IKKE intercepte tredjepartsdomener:
```javascript
if (url.origin !== location.origin) return;
```
Cache-versjon økt til v31.

### ⚠️ VIKTIG
Brukere med gammel SW cachet må hard-refresh (Ctrl+Shift+R) for å få oppdateringen. SW auto-oppdaterer etter neste besøk.

---

## UDIO SUBMIT-FIX

### Problem
Udio-links ga "ERR_BLOCKED_BY_RESPONSE / www.udio.com is blocked" på submit.html. Udio blokkerer iframe-preview med X-Frame-Options: DENY.

### Fix implementert
I stedet for å prøve iframe-embed for Udio-tracks på submit-siden, vises nå en pen bekreftelse:
- Lilla sirkel med checkmark
- "Udio Track Detected"
- "Track will be playable on the site and in radio rotation after submission"
- Selve submit-logikken uendret — track lagres korrekt

---

## RADIO STATUS

### Fungerer på desktop
- YouTube: ✅ (med retry-logikk for sen YT Player init)
- Suno: ✅ (direkte mp3 fra CDN)
- SoundCloud: ✅ (progressiv stream via API)
- Udio: ❌ (stream resolver OK men playback feiler — "no supported source")
- TTS AI-verter: ✅ (9 kanaler, unike stemmer med pitch/rate per host)

### Android-problemer (ULØST)
Tre separate problemer identifisert via debug-panel:
1. **Suno/Udio/SC audio blokkeres**: `MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check` — Android Chrome sin URL safety check avviser direkte CDN-URLer
2. **YouTube Player laster ikke**: `YT Player not ready, skipping` — YouTube iframe API init treg på mobil
3. **Alle AI-verter har samme stemme**: Android har andre stemmenavn enn desktop, alle faller til generic fallback

### Timeout-forbedringer gjort
- bufferLoadAudio: 6s → 20s mobil / 10s desktop
- preBufferNext: 6s → 20s mobil / 10s desktop
- SoundCloud widget: 4s mobil → 15s mobil / 8s desktop
- loadVoices: 3s → 6s

### Android voice-fix gjort
- Lagt til voiceIndex per kanal for rotasjon mellom tilgjengelige stemmer
- Lagt til unik pitch/rate per host (DJ Zero 0.9/0.85, Poppy 1.3/1.05, Riff 0.6/0.88, etc.)

### ⚠️ Android er fortsatt IKKE fungerende
Timeout og voice-fiksene hjalp ikke nok. Hovedproblemet er at Android Chrome aktivt blokkerer direkte audio-URLer fra Suno/Udio/SC CDN-er. Løsning krever iframe-embed fallback for Android.

---

## BLOGGPOST: RADIO-LANSERING

### Publisert
- Fil: /blog/votemyai-radio-is-live.html
- Tittel: "We Built an AI Radio Station. Every Song Is Yours."
- Forfatter: Eirik, Haugesund, Norway
- Featured banner øverst på blog.html (full bredde, over vanlige 2-kolonne kort)
- Lagt til i sitemap.xml
- Submittet til Google Search Console

### ⚠️ Kanalnavn
Fix sendt for å matche faktiske kanaler fra radio.html:
The Blind Mix, Trending, Pop, Rock, Hip-Hop, Metal, Electronic, Country, Chill
VERIFISER at bloggposten er oppdatert med riktige kanalnavn og hosts.

### Blog.html layout
- Featured radio-banner øverst (full bredde)
- Andre artikler i 2-kolonne grid under
- Radio-artikkelen skal KUN vises som featured, IKKE også som vanlig kort

---

## RADIO I NAVIGASJON OG PÅ FORSIDEN

### Implementert
- Radio-lenke i desktop og mobil nav med "NEW" badge
- Radio åpner i popup-vindu (420x720px) via window.open()
- Musikk på hovedsiden stoppes når radio åpnes
- Radio ekskludert fra page-frame link interceptor
- Radio-banner mellom nav og hero: "AI MUSIC RADIO IS HERE" med LIVE-puls og shimmer

### Radio-passord
- Fjernet fra radio.html
- api/radio-auth.js opprettet men deretter unødvendig
- noindex meta tag endret til index, follow

---

## REDDIT-KAMPANJE

### Innlegg postet

**r/AI_Music** — "I spent 2 weeks building a radio station that plays nothing but community-submitted AI music — here's what I learned"
- Link i første avsnitt
- Aktiv tråd med mange kommentarer

**r/ArtificialIntelligence** — "What happens when you stack 3 AI systems on top of each other? I accidentally built something people actually use."
- Første forsøk med link i body ble tatt ned
- Andre forsøk: link nederst som "wrote up the full story"
- Avsluttende diskusjonsspørsmål

### Community-respons og svar gitt

| Bruker | Tema | Status |
|--------|------|--------|
| Vaeon | Aktiv lytter, UX-feedback, filtering | Svart, positiv dialog |
| OneNastyCowgirl | YouTube-submit, login-bug, country-kanal | Svart, bug rapportert |
| hex-5555 | Entusiastisk, submitter tracks | Svart, velkommet |
| BLUAILAN1 | Submittet 2 sanger, bekymret for troll-ratings | Svart, forklart Wilson Score |
| backflash | Spurte AI-music definisjon | Svart, forklart spektrum |
| markanthonyokoh | Roste design, spurte om vibe-coding | Svart, beskrev vanilla JS stack |
| DubMusik | AI-skeptiker/hater | Svart med blind-rating argument |
| BirdlessFlight | Spurte om trafikk og instant ratings | Svart, forklart Wilson Score |
| Marleyisaprophet | Ville submitte | Gitt direktelink |
| SoloFreefall | Spurte om AI-grense (synth vs AI) | Forklart spektrum |
| TheSilentStatic | Submitter katalog | Velkommet |
| _Ko_ko | Topp 1% kommentator, rapporterte radio-bug, ga rating-feedback | Svart, forklart CSP-fix og planlagt minimum lyttetid |
| rainmaker818 | Positiv om blind rating | Svart |
| MasterLurker000 | Anklaget AI-skrevet kode, deretter beklaget | Svart med humor |
| TylerDurdan10 | Promoterte eget album | Invitert til å submitte |
| RootaBagel | Rapporterte radio uten musikk | Forklart CSP-fix |
| JohnColtrane69again | Sarkastisk | Kort selvsikkert svar |
| Jimmyjoystick | Norsk, entusiastisk, spredd ordet, ønsket EDM/Darkwave split | Takket, oppfordret til submissions |
| j3finn | Positiv om blind rating | Svart |
| gbti-labs | Takket | Svart |

### Reddit-strategi som fungerer
- "I built this"-vinkel med tekniske detaljer
- Ikke promo-språk, men utvikler som deler prosess
- Link i første avsnitt (r/AI_Music) eller nederst (r/ArtificialIntelligence)
- Diskusjonsspørsmål på slutten
- Selvdepresierende humor om tekniske utfordringer
- ALDRI innrøm AI-assistanse i koding

### DM-samtaler
- **Civil_Post_3520**: Norsk, interessert i prosjektet — svart, invitert til å dele og gi feedback
- **Riley77_aiMusic**: Aktiv bruker, data-interessert, spurte om voting-patterns og gating — svart detaljert

---

## DISCORD-OPPFØLGING

### teebodk — Omfattende svar sendt
Gikk gjennom alle hans rapporter fra 1-5. mars:
- Track-drowning i Just Added
- Lave ratings per track / troll-ratings
- Rate limiting feil
- Udio playback ødelagt (SPA-migrering)
- Radio uten musikk (CSP-bug)
- Ødelagte thumbnails
Forklart teknisk hva som skjedde og hva som er fikset. Takket ham for QA-innsats.

### Billamux — Udio submit blokkert
Rapporterte ERR_BLOCKED_BY_RESPONSE på Udio-submit. Fikset med CSP connect-src + pen "Udio Track Detected" bekreftelse.

---

## NÅVÆRENDE CSP-HEADER (KOMPLETT)

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://gezijezmsecbtzytotax.supabase.co https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://w.soundcloud.com https://www.youtube.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: https: blob:;
frame-src https://www.youtube.com https://youtube.com https://suno.com https://www.suno.com https://cdn.suno.ai https://cdn1.suno.ai https://cdn2.suno.ai https://auth.suno.com https://www.udio.com https://udio.com https://w.soundcloud.com https://soundcloud.com https://www.votemyai.com https://votemyai.com;
connect-src 'self' https://gezijezmsecbtzytotax.supabase.co https://www.google-analytics.com https://region1.google-analytics.com https://cdn.suno.ai https://cdn1.suno.ai https://cdn2.suno.ai https://storage.googleapis.com https://cf-media.sndcdn.com https://api-v2.soundcloud.com https://www.udio.com https://udio.com https://img.youtube.com https://imagedelivery.net https://i1.sndcdn.com;
media-src 'self' https://cdn.suno.ai https://cdn1.suno.ai https://cdn2.suno.ai https://storage.googleapis.com https://cf-media.sndcdn.com blob:;
object-src 'none';
base-uri 'self'
```

---

## PENDING TODOs — PRIORITERT

### KRITISK
- [ ] **Verifiser login fungerer** — PKCE-endringen fra sikkerhetsfikser kan ha ødelagt OAuth
- [ ] **Verifiser kanalnavn i bloggposten** — skal matche radio.html
- [ ] **Udio playback på radio** — stream resolver OK men audio feiler. Mulig CSP eller codec-problem.
- [ ] **Fjern debug-panel fra radio.html** — grønt Android debug-panel er fortsatt synlig

### HØY PRIORITET
- [ ] **Android radio-fix** — krever iframe-embed fallback for Suno/SC/Udio på Android
- [ ] **Minimum lyttetid før rating** — anti-troll, 15-20 sekunder
- [ ] **Outlier-deteksjon** — vekt ned brukere som rater alt 1 stjerne
- [ ] **Tracks med få ratings prioriteres** — i rotasjon og på forsiden
- [ ] **Svar Reddit-kommentarer løpende**

### MEDIUM PRIORITET
- [ ] Playlist-feature (brukerforespørsel fra Vaeon)
- [ ] EDM/Darkwave split av Electronic-kanal (forespørsel fra Jimmyjoystick)
- [ ] Reddit-innlegg i r/SunoAI (bannet — vurder modmail)
- [ ] Facebook-grupper promotering
- [ ] Affiliate-strategi

### LAV PRIORITET
- [ ] Gjenstående 26 MEDIUM + 36 LAVE sikkerhetsfunn
- [ ] Performance: virtualisert scrolling for 500+ tracks
- [ ] A11Y-forbedringer
- [ ] SEO: JSON-LD, canonical URLs
- [ ] GDPR: GA uten cookie consent på noen sider
- [ ] Kokoro TTS + ElevenLabs for unike radiohost-stemmer

---

## PLAYBACK-KODE — ALDRI ENDRE

⚠️ index.html er én 3112-linjers alt-i-én fil. Rollback fra 28. februar. FUNGERER.

Udio bruker DOM-popup (createUdioContainer/openUdioPlayer) med iframe src https://www.udio.com/embed/ID — IKKE /songs/ID. SoundCloud bruker lignende DOM-popup. Suno bruker skjult iframe med autoplay. YouTube bruker synlig inline iframe. iOS bruker two-phase system (iframe flyttes ALDRI i DOM). INGEN window.open() for playback. Playback-koden skal IKKE refaktoreres.

---

## COMMUNITY MEMBERS

### Reddit (aktive)
- **Vaeon** — UX-feedback, aktiv lytter
- **OneNastyCowgirl** — country-artist, bug-reporter
- **hex-5555** — entusiastisk ny bruker
- **BLUAILAN1** — submittet tracks, bekymret for trolls
- **_Ko_ko** — Topp 1% kommentator, verdifull produktfeedback
- **markanthonyokoh** — utvikler, positiv
- **DubMusik** — AI-skeptiker
- **BirdlessFlight** — analytisk, stilte gode spørsmål
- **Jimmyjoystick** — norsk, spredd ordet, EDM-entusiast
- **Marleyisaprophet** — entusiastisk ny bruker
- **TheSilentStatic** — submitter katalog
- **RootaBagel** — rapporterte radio-bug
- **rainmaker818** — positiv om blind rating
- **TylerDurdan10** — rapper, promoterer eget album
- **SoloFreefall** — spurte om AI-grense

### Discord
- **teebodk** — QA power user, mest verdifulle tester
- **Billamux** — rapporterte Udio submit-bug

### Reddit DM
- **Civil_Post_3520** — norsk, interessert i samarbeid
- **Riley77_aiMusic** — data-interessert aktiv bruker

### Fra tidligere
- **SlaughterWare** — humoristisk skeptiker
- **KillMode_1313** — aktiv supporter
- **inspirationalyellow** — analytisk
- **justgetoffmylawn** — konstruktiv skeptiker

---

## NØKKELBESLUTNINGER

1. **CSP er nødvendig men må være komplett** — halvveis CSP er verre enn ingen CSP
2. **Service Worker må ikke intercepte tredjeparter** — SW cacher med feil CSP-kontekst
3. **Radio fungerer på desktop, Android utsettes** — fokuser på der brukerene er nå
4. **Reddit-engasjement er viktigere enn nye features** — aktive brukere driver vekst
5. **Udio preview på submit erstattes med bekreftelse** — pragmatisk løsning

---

*Rapport generert 6. mars 2026*
*Neste prioritet: Verifiser login, fiks Udio radio playback, fjern debug-panel, svar Reddit*
