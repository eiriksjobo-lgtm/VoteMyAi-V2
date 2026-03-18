# VoteMyAI - Fullstendig statusrapport
## 16. mars 2026 - Til ny chat

---

## PLATTFORMSTATUS (siste tall 16. mars, ca 18:00)

- Tracks: 1060
- Ratings: 6837
- Comments: 83
- Users: 316
- Avg rating: 2.7
- Messages: 6

### Vekst siste 24 timer (fra 15. mars morges)
- +16 brukere (300 til 316)
- +46 tracks (1013 til 1059)
- +323 ratings (6512 til 6835)
- +1 comment

---

## TEKNISK ARKITEKTUR

### Kodebase
- Alt ligger i én enkelt index.html (~3112 linjer). ALDRI refaktorer til multi-fil.
- Rollback til 28. feb er gjort. js/player.js, js/main.js, js/app.js, app.css er SLETTET permanent.
- 58 tracked filer i GitHub repo: eiriksjobo-lgtm/VoteMyAi-V2
- Stack: Vanilla HTML/CSS/JS + Supabase + Vercel

### Vercel env vars
- RADIO_PASSWORD
- SUPABASE_SERVICE_KEY

### CSP i vercel.json (eksplisitte domener)
- youtube.com, suno.com, cdn.suno.ai, cdn1.suno.ai, cdn2.suno.ai, auth.suno.com, udio.com, w.soundcloud.com

### GitHub branch protection
- Restrict deletions: ON
- Block force pushes: ON
- PR requirement: OFF (Claude Code kan pushe direkte til main)

### PLAYBACK REGLER - ALDRI ENDRE
- Udio: DOM-popup (createUdioContainer/openUdioPlayer), iframe src https://www.udio.com/embed/ID (IKKE /songs/ID)
- SoundCloud: DOM-popup
- Suno: skjult iframe med autoplay
- YouTube: synlig inline iframe
- iOS: two-phase system, iframe flyttes ALDRI i DOM
- INGEN window.open() noensinne

---

## RADIO

### Status
- Lansert ca 6. mars 2026
- Popup-vindu 420x720px
- Passord fjernet, åpen for alle
- Nav-link med "NEW" badge

### 9 kanaler og AI-hosts
- The Blind Mix: DJ Zero
- Trending: Poppy
- Pop: Poppy
- Rock: Riff
- Hip-Hop: The Algorithm
- Metal: Lord Distortion
- Electronic: SYNC
- Country: Dusty
- Chill: Luna

### Regler
- Promos hver 3. sang (DJ Zero)
- Sponsors hver 7. sang (DJ Zero)
- Welcome-melding kun ved kanalbytte
- Ingen outros
- TTS-uttale: "vote my A.I. dot com"

### Kjente problemer
- Mobil-playback fungerer ikke optimalt (KRITISK: 71% mobil, Android 43%)
- Udio-avspilling på radio ikke testet
- Country-kanal har skipping-problem
- Debug-panel skal fjernes fra radio.html

---

## BLOG

### Publiserte innlegg (nyeste først)
1. the-week-ai-lost-the-oscars.html (16. mars 2026) - Oscars/Tilly Norwood
2. the-tilly-norwood-test.html (13. mars 2026) - AI composer bias
3. suno-lyrics-structure-tags.html
4. umg-ai-slop-who-decides-quality.html (eldste)

### Blogg-URLer
- https://www.votemyai.com/blog.html (oversiktsside - IKKE blog/index.html)
- https://www.votemyai.com/blog/the-week-ai-lost-the-oscars.html
- https://www.votemyai.com/blog/the-tilly-norwood-test.html

### Blogg-regler
- Nyeste innlegg alltid FØRSTE kort (venstre) i grid
- Alle kort skal ha "Read more" lenke
- Share-knapper på alle artikler (Reddit, X, Copy Link)
- "More from the Blog" seksjon nederst i hver artikkel
- Affiliatelenker og link til resources.html der det er naturlig

### Sitemap
- Oppdatert med begge nye blogginnlegg
- Sendt til Google Search Console

---

## AFFILIATE-STATUS

### Aktive programmer
- ElevenLabs: 22%, PartnerStack
- Soundverse: 25%, Tolt, ?ref=eirik
- AI Song Maker: 30%, Rewardful, ?via=eirik
- Kling/Lohas Games: 10%, Impact, https://klingaiaffiliate.pxf.io/YV9Pyq
- LALAL.AI: 30%, 180-dagers cookie, FirstPromoter
  - Key: 481e61cfbd4544ab
  - Link: https://www.lalal.ai/?referral=KotRNSRa

### På vent (PartnerStack)
- Murf AI (20%), Descript ($25), Gamma (30%), Prezi (50% til juli)

### På vent (direkte)
- LANDR ($15/ref)

### Søkt, venter svar
- Moises (Typeform)

### Ingen program
- Hailuo, Runway

### Impact-konto
- Individuell, Norge, USD
- Verification meta tag: b8750e45-5e21-432c-b529-c956380fe1ee (i index.html)

### Strategi
- Ingen bannere
- Naturlige integrasjoner: "Made with"-lenker, resources.html, bloggartikler, radio sponsor-spots

---

## REDDIT-STRATEGI

### Kontoer
- Sensitive_Artist7460: Founder-stemme, KAN lenke til votemyai.com
- hex-5555: Nøytral support, KAN IKKE lenke direkte

### Absolutte regler
- ALDRI em-dash (-)
- ALDRI skillelinjer (---)
- ALDRI bekreft AI-hjelp, deflekter ved anklage
- Varier svar-lengde og stil
- Ignorer en-ords/en-linjes trolls
- La folk ha siste ord når du er ferdig

### Beste postetider
- Lørdag/søndag 14:00-16:00 norsk tid
- Support-kommentar fra hex-5555 innen 30-60 min etter posting

### Subreddit-status
- r/SunoAI: BANNET
- r/AI_Music: PRIVAT (låst i dag, 16. mars)
- r/Music: Aktiv, strenge regler mot solicitation
- r/WeAreTheMusicMakers: Aktiv
- r/ArtificialIntelligence: Aktiv
- r/technology: Aktiv
- r/InternetIsBeautiful: Aktiv
- r/SideProject: Aktiv
- r/Entrepreneur: Aktiv
- r/artificial: Aktiv
- r/singularity: Aktiv
- r/futurology: Aktiv
- r/ChatGPT: Aktiv
- r/udiomusic: Aktiv
- r/indieheads: Aktiv
- r/mildlyinteresting: Aktiv
- r/woahdude: Aktiv

### Engasjerte brukere å følge med på
- Still_Satisfaction53: Skeptiker, tidligere antagonist
- FaceDeer: Reflektert, genuint engasjert, mange gode forslag
- OrraDryWit: Aktiv bidragsyter, god spec-writer
- tindalos: Teknisk innsiktsfull
- akabillposters: Topp 1% kommentator, velvillig men litt nedlatende
- BirdlessFlight: Har sang på plattformen (ΔForm)
- KillMode_1313: Fra r/udiomusic, skeptisk

---

## GA4-DATA (16. feb - 15. mars)

### Topp events
- page_view: 21 885 fra 2 253 brukere
- user_engagement: 11 633 fra 1 125 brukere
- rate: 4 068 fra 188 brukere (21 ratings per bruker snitt)
- track_submit: 689 fra 178 brukere
- share: 98 fra 17 brukere (allerede sporet)
- affiliate_click: 60 fra 53 brukere
- radio_open: 78 fra 42 brukere
- radio_banner_click: 69 fra 40 brukere

### Topp sider
1. /: 13 281 visninger, 3 min 38 sek engasjementstid
2. /profile.html: 2 081 visninger, høyest gjentaksrate
3. /login.html: 1 632 visninger, 10 sek (normalt)
4. /submit.html: 1 581 visninger, 3 min 38 sek
5. /blog.html: 893 visninger
6. Beste blogg: /blog/say-no-to-suno-300m-ai-music-quality.html: 345 visninger

### Anomalier
- /app.html: 972 visninger fra 1 bruker, 0 sek. Trolig bot eller cachet URL. Skal ikke eksistere.
- /playlist.html: 179 visninger fra 6 brukere. Skal ikke eksistere etter rollback.
- Sjekk Google Search Console for indeksering av disse.

---

## KRITISKE TODOS (prioritert rekkefølge)

1. **Android/mobil radio-fix** - KRITISK, 71% mobil, Android 43%
2. **Verifiser login** - PKCE K4 fix
3. **Fjern debug-panel** fra radio.html
4. **Minimum lyttetid** før rating (15-20 sekunder)
5. **fix-og-images.sh** - fullføre scriptet
6. **Full nettstedsbackup** - utsatt fra mandag
7. **Test Country-kanal** - skipping-problem
8. **Udio-avspilling** på radio
9. **Verifiser kanalnavn** i bloggpost (Chill/Trending, ikke Funk/R&B)
10. **Send teebodk** oppdateringsmelding
11. **Rating system redesign** - research gjort
12. **Sjekk app.html og playlist.html** i Google Search Console, send fjerningsforespørsel
13. **r/AI_Music** - send join-forespørsel fra hex-5555

---

## BRUKERFORSLAG BACKLOG (17 stk)

1. Find artist etter rating
2. Genre leaderboard
3. Listen duration tracking
4. "Find me on"-lenker
5. Instrumental-tag
6. Blind mode fix (skjul artwork)
7. Discord-integrasjon
8. Contests
9. Minimum lyttetid før rating
10. Rating direkte fra radio-spiller
11. Skip-metrikk som kvalitetsmål (atferd over mening)
12. Crowd-sourced tagging under rating-flyten
13. Album/spilleliste-gruppering
14. Direkte MP3-opplasting
15. Vekting av ratings etter lyttetid
16. Genre-breakdown av snittrating
17. Forfatternotat uten å røpe identitet

---

## NØKKEL-MESSAGING

- Sterkest resonerende: "removes clout bias"
- Tagline: "Hear first. Judge second."
- TTS-uttale: "vote my A.I. dot com"
- Snitt 2.7-2.8/5 er et positivt datapunkt - viser at folk er ærlige, ikke at musikken er dårlig

---

## DENNE UKENS STORE SAKER

### Tilly Norwood / Oscars
- AI-sang "Take the Lead" (Suno) sluppet 10. mars, dekket av 10 store medier
- Under 30K views etter 24 timer
- Oscars-tema: "actual intelligence, not artificial intelligence"
- "Golden" fra KPop Demon Hunters vant Best Original Song (16. mars)
- Første K-pop-sang å vinne Oscar noensinne
- To blogginnlegg publisert om dette

### Apple Music Transparency Tags
- Lansert 5. mars 2026
- Merker AI-innhold, men kun hvis distributører velger å tagge
- Deezer mottar 60 000 AI-spor daglig

### Suno V5 / Lyria 3
- Suno V5 ute med Studio DAW-funksjonalitet
- Lyria 3 fra Google/Gemini lansert 18. februar (30-sek tracks)
- Lyria 3 embed-player: monitor for støtte ASAP

---

## CLAUDE CODE-REGLER

- Alltid inkluder git push i prompts
- Alltid spesifiser grid/liste-rekkefølge eksplisitt
- blog.html er riktig URL (IKKE blog/index.html)
- index.html er én fil, ALDRI refaktorer
- Playback-regler er hellige, ALDRI endre

---

## KONTAKTINFO

- E-post: contact@votemyai.com (Domeneshop)
- GitHub: eiriksjobo-lgtm/VoteMyAi-V2
- Live site: https://www.votemyai.com
- Resources: https://www.votemyai.com/resources.html
- Blog: https://www.votemyai.com/blog.html
