# 💌 Teacher's Day Wishes

> *"The fact that I can send you a wish through a website of my own making — is because of you."*

A 3D animated Teacher's Day letter — an envelope that opens, a song that plays, flowers that bloom, and a message of gratitude written in code.

🌸 **Live site:** https://shuvam-banerji-seal.github.io/Teacher-s-Day-Wishes/

## The Experience

1. **Loading** — a 3D garden blooms behind the progress bar: procedural flowers opening petal by petal, glowing ribbon spirals, drifting light motes.
2. **The Envelope** — a hand-built 3D envelope floats in a dark, elegant space, sealed with a glowing rose wax seal. Click it.
3. **The Opening** — a single 6.2-second choreography: the wax seal wakes and shatters into tumbling wedges, the flap swings back to show the dark interior, the letter rises clear of the mouth on a burst of petals, its folded top half unfolds, the spent envelope bows out of frame, and the letter turns a full waltz to present itself before settling into a perpetual drift.
4. **The Letter** — *To Those Who Taught Me, and Those Who Walked Beside Me*: a letter to the teachers of New Horizon High School, Jodhpur Park Boys' School and IISER Kolkata, who began as teachers and became elder brothers and sisters.
5. **Personalized** — the site detects your city and country from your IP and addresses you where you are.
6. **The Song** — *"Teacher"* by TOMONARI SORA (theme of *Assassination Classroom: The Movie*) plays softly in the background. 🔊

## Built With

- [Three.js](https://threejs.org) (r185) — 3D envelope, letter, flowers, ribbons, petals, particles
- Vanilla JS + CSS — letter overlay, loading UI, typography
- ipwho.is / geojs.io / ipapi.co — visitor geolocation (fallback chain)
- yt-dlp — fetching the song
- Playwright — automated animation & interaction testing

## Run Locally

```bash
git clone https://github.com/Shuvam-Banerji-Seal/Teacher-s-Day-Wishes.git
cd Teacher-s-Day-Wishes
python3 -m http.server 8000
# open http://localhost:8000
```

## Structure

```
index.html          — the page
css/style.css       — letter, loading UI, typography
js/
  main.js           — orchestrator (state machine, progress, personalization)
  stage.js          — shared WebGL renderer + render loop
  loading-scene.js  — 3D blooming flowers + ribbons + motes
  envelope-scene.js — 3D envelope, shattering seal, unfolding letter, open choreography
  flowers.js        — procedural flower geometry
  petals.js         — falling petal particle field
  audio.js          — song playback (gesture-unlocked, looped, mutable)
  geo.js            — IP → city/country personalization
assets/audio/song.m4a — "Teacher" — TOMONARI SORA
```

## Credits

- Song: **"Teacher" — TOMONARI SORA** (友成空), theme song for *Assassination Classroom: The Movie*. Video: https://youtu.be/BqFknuFhsCU
- Three.js © its authors, MIT license (vendored in `js/`)
- Fonts: Great Vibes & Cormorant Garamond (Google Fonts)

*Every petal is code. Every line is a thank-you.* 🌸
