# VoteMyAI - Fullstendig statusrapport
## 18. mars 2026 - Til ny chat

---

## PLATTFORMSTATUS (siste tall 18. mars, ca 19:00)

- Tracks: 1082
- Ratings: 6966
- Comments: 82
- Users: 326
- Avg rating: 2.8
- Messages: 0 (vises feil i admin — edge functions ikke deployet ennå)

### Vekst siden 16. mars morges
- +10 brukere (316 til 326)
- +22 tracks (1060 til 1082)
- +129 ratings (6837 til 6966)

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

## SIKKERHETSARBEID 18. MARS (KRITISK INFO)

### Tre runder sikkerhetsgjennomgang ble utført i dag. Her er alt som ble fikset:

### Runde 1 — Første audit (commit 3e09587)
- K1: UUID-validering av anon_token og ip_address før PostgREST-interpolering
- K2: Kun cf-connecting-ip som IP-kilde (Cloudflare stripper spoofede headere)
- K3: CORS låst til https://www.votemyai.com i admin-delete og admin-users
- K4: timingSafeEqual() for passordsammenligning i admin-endepunkter
- K5: Atomisk UPSERT med onConflict i rate-track (erstattet SELECT→INSERT race condition)
- K6: unsafe-eval fjernet fra CSP i vercel.json
- K7: minimum_password_length = 8 i supabase/config.toml
- H1: AVG beregnes nå med SQL RPC get_track_stats() istedenfor JS-paginering
- H9: Sitemap www-mismatch fikset
- H10: _backup/-mappe med hardkodet API-nøkkel slettet

### Migrasjoner kjørt i Supabase (manuelt i SQL Editor):
1. get_track_stats() SQL-funksjon + UNIQUE constraint på anonymous_ratings(track_id, anon_token)
2. admin_rate_limits-tabell for persistent rate limiting

### Runde 2 — Andre audit (commit b1ad746)
- F1: timingSafeEqual reimplementert korrekt (itererer max(len), XOR-er lengdeforskjell)
- F2: Separate IPV4_RE/IPV6_RE med oktetvalidering
- F3: In-memory rate limiting på admin-endepunkter erstattet med Supabase-tabell admin_rate_limits
- F4: Eksplisitt feilsjekk etter upsert — returnerer tydelig feil hvis constraint mangler
- F5: RPC fallback overskriver ikke tracks-tabellen med 0/0 lenger
- E4: trackParam valideres som UUID med regex før querySelector
- E5: document.referrer fjernet som redirect-fallback i index.html
- E10: 5 rapport-filer slettet fra repo (inneholdt affiliate-nøkler, Reddit-kontoer, strategi)

### Runde 3 — Tredje audit (commit P2-P4 etc.)
- P2: Avviser requests der ip_address === "unknown" med 400
- P3: Admin rate limiting flyttet til persistent Supabase-tabell admin_rate_limits
- P4: hl()-funksjonen i admin.html bruker nå DOM-basert tilnærming istedenfor innerHTML
- P12: 97 console.log fjernet fra radio.html
- P13: 7 filer slettet fra rot (zip-filer, jpg, html-duplikat)
- P14: login.html — document.referrer fjernet, kun urlParams.get('redirect') eller /
- P18: Generisk feilmelding i rate-track istedenfor intern constraint-info
- P19: robots.txt — fjernet admin/login Disallow, lagt til Disallow: /api/

### RLS-policies verifisert og fikset manuelt i Supabase:
- tracks: "Allow update avg_rating" med using(true) DROPPET — åpnet for manipulering av snittrating
- contact_messages: "Anyone can view contact messages" DROPPET — eksponerte e-poster og meldinger
- profiles: "Anyone can view profiles" DROPPET — erstattet med "Users can view own profile" (auth.uid() = id)
- anonymous_ratings: OK — kun SELECT for alle, INSERT/UPDATE via service role
- ratings: OK — auth.uid() = user_id på UPDATE
- votes: OK — auth.uid() = user_id på DELETE
- duration_seconds: Tom tabell, ingen RLS ennå — ikke akutt

### Gjenstående kjente sårbarheter (akseptable nå):
- Vote stuffing med mange tokens — krever arkitekturendring
- unsafe-inline CSP — krever full refaktor av hele kodebasen
- Token i localStorage — arkitekturproblem, standard for Supabase-apper

---

## KRITISK TODO — MÅ GJØRES I MORGEN (19. MARS)

### 1. DEPLOY EDGE FUNCTIONS VIA SUPABASE DASHBOARD (VIKTIGST)
Kontaktskjema fungerer ikke fordi edge functions ikke er deployet etter kodeendringer.
Gå til: supabase.com → ditt prosjekt → Edge Functions → deploy disse tre:
- admin-delete
- admin-users  
- rate-track

Alternativt fra terminal (hvis Supabase CLI er installert):
```
supabase functions deploy admin-delete admin-users rate-track
```

Uten dette vises ikke kontaktmeldinger i admin-panelet.

### 2. Resterende prioriteter
2. Android/mobil radio-fix (KRITISK — 71% mobil, Android 43%)
3. Verifiser login (PKCE-fix)
4. Fjern debug-panel fra radio.html
5. Minimum lyttetid før rating (15-20 sek)
6. fix-og-images.sh
7. Full nettstedsbackup
8. Test Country-kanal (skipping-problem)
9. Udio-avspilling på radio
10. Send teebodk oppdateringsmelding
11. Rating system redesign
12. r/AI_Music — send join-forespørsel fra hex-5555

---

## BLOGG

### Publiserte innlegg (nyeste først)
1. google-lyria-3-gemini-music-750-million.html (18. mars 2026) — PUBLISERT I DAG
2. the-week-ai-lost-the-oscars.html (16. mars 2026)
3. the-tilly-norwood-test.html (13. mars 2026)
4. suno-lyrics-structure-tags.html
5. umg-ai-slop-who-decides-quality.html (eldste)

### Blogg-URLer
- https://www.votemyai.com/blog.html (oversiktsside — IKKE blog/index.html)
- https://www.votemyai.com/blog/google-lyria-3-gemini-music-750-million.html
- https://www.votemyai.com/blog/the-week-ai-lost-the-oscars.html
- https://www.votemyai.com/blog/the-tilly-norwood-test.html

### Blogg-regler
- Nyeste innlegg alltid FEATURED øverst (full bredde horisontalt)
- Deretter 2-kolonners grid under i rekkefølge
- Alle kort skal ha "Read more"-lenke
- Share-knapper på alle artikler (Reddit, X, Copy Link)
- "More from the Blog"-seksjon nederst i hver artikkel
- Affiliatelenker og link til resources.html der det er naturlig

### Claude Code-regler for blogg
- Les alltid en eksisterende bloggfil som mal FØR du skriver ny
- Spesifiser alltid grid-rekkefølge eksplisitt
- blog.html er riktig URL (IKKE blog/index.html)
- Oppdater alltid sitemap.xml
- Send alltid til Google Search Console etter publisering

### Sitemap
- Oppdatert med alle blogginnlegg inkl. Lyria 3-artikkelen
- Sendt til Google Search Console

### SEO-artikler (eldre, ikke redaksjonelle)
- suno-vs-udio-vs-elevenlabs.html
- how-to-make-ai-music.html
- best-free-ai-music-generators.html
- ai-music-prompt-tips.html
- what-is-ai-music.html

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
- Debug-panel skal fjernes fra radio.html (97 console.log fjernet, men debug-panel gjenstår)

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
- Moises (Typeform) — NB: Charlie Puth ble Chief Music Officer hos Moises 4. mars 2026

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
- Sensitive_Artist7460: Founder-stemme, KAN lenke til votemyai.com direkte
- hex-5555: Nøytral support, KAN IKKE lenke direkte

### Absolutte regler
- ALDRI em-dash (—)
- ALDRI skillelinjer (---)
- ALDRI bekreft AI-hjelp, deflekter ved anklage
- Varier svar-lengde og stil
- Ignorer en-ords/en-linjes trolls
- La folk ha siste ord når du er ferdig
- Alltid avslutt kommentarer med et spørsmål for å holde diskusjonen i gang
- Aldri la de to kontoene svare hverandre for raskt

### Beste postetider
- Lørdag/søndag 14:00-16:00 norsk tid
- Support-kommentar fra hex-5555 innen 30-60 min etter posting

### Subreddit-status
- r/SunoAI: Sensitive_Artist7460 er IKKE bannlyst (tidligere feil info)
- r/AI_Music: Privat/låst — send join-forespørsel fra hex-5555
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

### Aktive Reddit-tråder 18. mars

#### Tråd 1: r/Music — Lyria 3-innlegg (Sensitive_Artist7460)
Tittel: "Google just gave 750 million people a music studio. That's either exciting or terrifying depending on who you ask."
Status: 1500+ visninger, 21+ kommentarer
Link: https://www.votemyai.com/blog/google-lyria-3-gemini-music-750-million.html
Engasjerte brukere: Cyanopicacooki (Topp 1%, støttende), LeBronFanSinceJuly (troll, ignorer alltid)
NB: CustomisingLassie oppdaget koblingen mellom Sensitive og hex-5555. Ikke svar på den kommentaren.

#### Tråd 2: r/udiomusic — Lyria 3-innlegg (Sensitive_Artist7460)
Tittel: "Google Lyria 3 just went live for 750 million Gemini users. Thoughts?"
Status: 3100+ visninger, 10 upvotes, 21 kommentarer
Engasjerte brukere: captainrv (informert, positiv), Suno_for_your_sprog (Community Leader, kritiserte blogg-skrivestil — ta til etterretning)

#### Tråd 3: r/Music — Elvis-innlegg (Sensitive_Artist7460) — AKTIV AKKURAT NÅ
Tittel: "Elvis Presley recorded 711 songs. He wrote none of them."
Status (ca 19:00): 89 000+ visninger, 198 upvotes, 192+ kommentarer — PÅ VEI TIL FRONTSIDEN
Ingen VoteMyAI-lenke i dette innlegget — ren karma-farming
Strategi: Svar på alle kommentarer med et spørsmål på slutten
Engasjerte brukere å følge opp:
- Cyanopicacooki (Topp 1%, svært aktiv og støttende)
- ImpendingSenseOfDoom (god Beatles-diskusjon)
- nakifool (Max Martin-korreksjon, engasjert)
- galagapilot (korrigerte fakta med bilde av Poor Boy — co-credits)
- LeBronFanSinceJuly (troll, ignorer alltid)

### Karma-farming innlegg klare til posting lørdag
Alle innlegg under skal postes LØRDAG 14:00-16:00 norsk tid:

**r/Music (Sensitive_Artist7460):**
Tittel: Google just gave 750 million people a music studio. That's either exciting or terrifying depending on who you ask.
[allerede postet og aktiv]

**r/WeAreTheMusicMakers (Sensitive_Artist7460):**
Tittel: Lyria 3 is now inside Gemini. 750 million people can make a song without opening a single new app.
Tekst: [Se forrige rapport for full tekst + lenke til blogg]

**r/artificial, r/singularity, r/ChatGPT, r/udiomusic, r/futurology:**
[Se forrige chat for alle innlegg med lenker]

**BTS-innlegg (fredag 17:00 norsk tid når albumet slipper):**
Tittel: BTS went quiet for 3 years and it actually worked
Tekst: Every single member. Military service. No albums, no tours, nothing. Album drops Friday. Netflix concert Saturday in Seoul. Can't think of another band that walked away at that level and pulled it off.

### Engasjerte brukere å følge med på
- FaceDeer: Reflektert, genuint engasjert, mange gode forslag
- OrraDryWit: Aktiv bidragsyter
- tindalos: Teknisk innsiktsfull
- akabillposters: Topp 1% kommentator, velvillig men litt nedlatende
- BirdlessFlight: Har sang på plattformen (ΔForm)
- KillMode_1313: Fra r/udiomusic, skeptisk men engasjert
- Still_Satisfaction53: Skeptiker
- teebodk: Discord power user/QA — send oppdateringsmelding

---

## GA4-DATA (16. feb - 15. mars) — REFERANSE

### Topp events
- page_view: 21 885 fra 2 253 brukere
- user_engagement: 11 633 fra 1 125 brukere
- rate: 4 068 fra 188 brukere (21 ratings per bruker snitt)
- track_submit: 689 fra 178 brukere
- share: 98 fra 17 brukere
- affiliate_click: 60 fra 53 brukere
- radio_open: 78 fra 42 brukere
- radio_banner_click: 69 fra 40 brukere

### Topp sider
1. /: 13 281 visninger, 3 min 38 sek engasjementstid
2. /profile.html: 2 081 visninger
3. /login.html: 1 632 visninger
4. /submit.html: 1 581 visninger
5. /blog.html: 893 visninger
6. Beste blogg: /blog/say-no-to-suno-300m-ai-music-quality.html: 345 visninger

### Anomalier (sjekk Google Search Console)
- /app.html: 972 visninger fra 1 bruker, 0 sek — trolig bot
- /playlist.html: 179 visninger — skal ikke eksistere etter rollback

---

## AKTUELLE AI-MUSIKK-NYHETER (mars 2026)

### Største nyheter akkurat nå:
1. **Google Lyria 3 i Gemini** (17. mars) — 750 millioner brukere fikk AI-musikk over natten. Bloggartikkel publisert.
2. **BTS "Arirang"** (slipper 20. mars) — Første album på 3+ år etter militærtjeneste. Live på Netflix 21. mars. Enormt på Reddit akkurat nå.
3. **SCOTUS avviste AI-copyright-sak** (2. mars) — Thaler v. Perlmutter, rent AI-innhold kan ikke opphavsrettbeskyttes i USA
4. **Charlie Puth Chief Music Officer hos Moises** (4. mars) — Moises er på affiliate-ventelisten vår
5. **Apple Music Transparency Tags** (5. mars) — Merker AI-innhold, men kun opt-in for distributører
6. **OpenAI "Sonata"** — Subdomener registrert, mulig musikk-AI på vei

### Bloggideer som ikke er skrevet ennå:
- "Your AI Song Has No Owner" — SCOTUS-avgjørelsen og hva det betyr
- "97% Can't Tell" — Stromae/Papaoutai-saken (AI-cover med 14M streams)
- "AI as Brush vs. AI as Painter" — Charlie Puth/Moises vs. Suno/Udio

---

## NØKKEL-MESSAGING

- Sterkest resonerende: "removes clout bias"
- Tagline: "Hear first. Judge second."
- TTS-uttale: "vote my A.I. dot com"
- Snitt 2.7-2.8/5 er et positivt datapunkt — viser at folk er ærlige, ikke at musikken er dårlig

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
11. Skip-metrikk som kvalitetsmål
12. Crowd-sourced tagging under rating-flyten
13. Album/spilleliste-gruppering
14. Direkte MP3-opplasting
15. Vekting av ratings etter lyttetid
16. Genre-breakdown av snittrating
17. Forfatternotat uten å røpe identitet
18. NY (fra mikrodizels 18. mars): Pause/skip-funksjon i spilleren — mangler og skaper bias mot intro

---

## KONTAKTMELDINGER (fra Supabase — vises ikke i admin ennå)

1. Black Hole Music (black-hole@live.com) — 17. mars: Rapporterte MJ vocal clones og 1000-ratings-bug. Begge fikset.
2. Eirik Sjøbø (eiriksjobo@gmail.com) — 18. mars: Testmelding
3. Testmeldinger fra Eirik

---

## CLAUDE CODE-REGLER

- Alltid inkluder git push i prompts
- Alltid spesifiser grid/liste-rekkefølge eksplisitt
- blog.html er riktig URL (IKKE blog/index.html)
- index.html er én fil, ALDRI refaktorer
- Playback-regler er hellige, ALDRI endre
- Send alltid én komplett prompt — aldri be Claude Code lese filer som forberedelse

---

## KONTAKTINFO

- E-post: contact@votemyai.com (Domeneshop)
- GitHub: eiriksjobo-lgtm/VoteMyAi-V2
- Live site: https://www.votemyai.com
- Resources: https://www.votemyai.com/resources.html
- Blog: https://www.votemyai.com/blog.html

---

## VIKTIG OM RAPPORT-FILER

Rapport-filer skal IKKE lagres i GitHub-repoet. De var tidligere eksponerte på nettet og inneholdt sensitiv info. Bruk kun lokalt eller i denne chat-konteksten.
