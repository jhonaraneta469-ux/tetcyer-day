/* main.js - orchestrator for the Teacher's Day experience.
   Flow: loading (3D flowers+ribbons) -> gesture -> audio unlock
         -> envelope scene -> click envelope -> open -> letter */
import { createStage } from './stage.js';
import { buildLoadingScene } from './loading-scene.js';
import { buildEnvelopeScene } from './envelope-scene.js';
import { AudioBus } from './audio.js';
import { personalize } from './geo.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  loader: $('#loader'),
  progressFill: $('#progressFill'),
  progressPct: $('#progressPct'),
  openBtn: $('#openBtn'),
  sceneUi: $('#sceneUi'),
  muteBtn: $('#muteBtn'),
  hint: $('#hint'),
  letterOverlay: $('#letterOverlay'),
  replayBtn: $('#replayBtn'),
  greetingSlot: $('#greetingSlot'),
};

const state = {
  entered: false,
  envelopeOpened: false,
  audio: new AudioBus('assets/audio/song.m4a'),
};

/* ── progress: a narrated, staged loading sequence ──
   Each real asset maps to a stage label; the bar advances
   only when the thing is genuinely ready, and each stage
   holds for at least MIN_STAGE_MS so the narration reads
   as a sequence rather than a flash. */
const STAGES = [
  { key: 'three.js', label: 'summoning the three dimensions…' },
  { key: 'scene',    label: 'folding the envelope…' },
  { key: 'fonts',    label: 'mixing the ink and choosing the letters…' },
  { key: 'audio',   label: 'tuning the strings for the song…' },
];
const MIN_STAGE_MS = 650;   // narration beat
const doneSet = new Set();
const labelEl = $('#progressLabel');
const stageQueue = [];      // labels waiting for their beat
let beatBusy = false;

function playBeat() {
  if (beatBusy) return;
  beatBusy = true;
  const next = () => {
    if (stageQueue.length === 0) { beatBusy = false; checkAllDone(); return; }
    const { key, label } = stageQueue.shift();
    labelEl.style.opacity = '0';
    setTimeout(() => {
      labelEl.textContent = label;
      labelEl.style.opacity = '1';
      setTimeout(next, MIN_STAGE_MS);
    }, 200);
  };
  next();
}

function checkAllDone() {
  if (doneSet.size >= STAGES.length) {
    labelEl.style.opacity = '0';
    setTimeout(() => {
      labelEl.textContent = 'everything is ready for you.';
      labelEl.style.opacity = '1';
      revealOpenBtn();
    }, 300);
  }
}

function bumpProgress(key) {
  if (doneSet.has(key)) return;
  doneSet.add(key);
  const pct = Math.min(100, Math.round((doneSet.size / STAGES.length) * 100));
  els.progressFill.style.width = pct + '%';
  els.progressPct.textContent = pct + '%';
  const stage = STAGES.find(s => s.key === key);
  if (stage) stageQueue.push(stage);
  playBeat();
}
function revealOpenBtn() {
  if (state.entered) return;
  els.openBtn.classList.remove('hidden');
  els.openBtn.focus({ preventScroll: true });
}

/* fonts */
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => bumpProgress('fonts'));
} else {
  setTimeout(() => bumpProgress('fonts'), 300);
}

/* audio preload */
state.audio.preload().then(() => bumpProgress('audio')).catch(() => bumpProgress('audio'));

/* build stage + both scenes */
const stage = createStage(document.getElementById('stage'));
buildLoadingScene(stage);
const envelopeScene = buildEnvelopeScene(stage);
stage.activate('loading');   // start rendering the loading scene
bumpProgress('scene');

/* debug handle for testing (harmless in prod) */
window.__stage = stage;
window.__envelopeScene = envelopeScene;

/* three.js itself is already imported by this point */
bumpProgress('three.js');

/* geo personalization (async, non-blocking) */
personalize((data) => {
  if (data && data.city) {
    /* The city here is the READER's, not mine, so the salutation has to
       address them where they are rather than claim to be sent from there. */
    const hour = new Date().getHours();
    const when = hour < 5  ? 'this small hour'
               : hour < 12 ? 'this morning'
               : hour < 17 ? 'this afternoon'
               : hour < 21 ? 'this evening'
               : 'this night';
    const place = data.city + (data.country ? ', ' + data.country : '');
    els.greetingSlot.textContent =
      'To my dear Teachers and Professors, whom ' + when + ' finds in ' + place + ',';
    const geoLine = $('#geoLine');
    const geoEmoji = $('#geoEmoji');
    if (geoLine && geoEmoji) {
      geoEmoji.textContent = data.flag || '🌍';
      geoLine.innerHTML =
        'This wish traveled through the internet to reach <strong>' +
        data.city + (data.region ? ', ' + data.region : '') +
        '</strong>, ' + data.country +
        ' <span style="opacity:.65">(' + data.ip + ')</span>. ' +
        'Wherever you are, my teachers\u2019 lessons travel with me.';
    }
  }
});

/* gesture -> unlock audio + enter envelope scene */
els.openBtn.addEventListener('click', () => {
  if (state.entered) return;
  state.entered = true;
  state.audio.play().catch(() => {});
  els.loader.classList.add('hidden');
  els.sceneUi.classList.remove('hidden');
  const gtb = $('#globalTopBar');
  gtb.classList.remove('hidden');
  envelopeScene.enter();
});

/* envelope opened -> let the 3D letter present itself (rotation, halo),
   then show the readable letter overlay */
envelopeScene.onOpen(() => {
  if (state.envelopeOpened) return;
  state.envelopeOpened = true;
  els.hint.classList.add('gone');
});

/* the 3D letter finishes presenting itself -> hand over to the readable
   overlay. Driven by the animation's own clock rather than a timer, so a
   slow device never has the overlay cover the sequence half-played. */
envelopeScene.onSequenceComplete(() => {
  els.letterOverlay.classList.remove('hidden');
});

/* replay */
els.replayBtn.addEventListener('click', () => {
  els.letterOverlay.classList.add('hidden');
  state.envelopeOpened = envelopeScene.reset();
  els.hint.classList.remove('gone');
  kbOpenBtn.classList.remove('gone');
});

/* keyboard access: Enter/Space or the small button opens the envelope */
const kbOpenBtn = $('#kbOpenBtn');
kbOpenBtn.addEventListener('click', () => envelopeScene.openViaKeyboard());
window.addEventListener('keydown', (e) => {
  if (!state.entered || state.envelopeOpened) return;
  if (e.key === 'Enter' || e.key === ' ') {
    // if focus is on a real control, let it handle the key
    const ae = document.activeElement;
    if (ae && (ae.id === 'muteBtn' || ae.id === 'kbOpenBtn')) return;
    envelopeScene.openViaKeyboard();
  }
});
envelopeScene.onOpen(() => kbOpenBtn.classList.add('gone'));

/* mute toggle */
els.muteBtn.addEventListener('click', () => {
  const muted = state.audio.toggleMute();
  els.muteBtn.textContent = muted ? '🔇' : '🔊';
  els.muteBtn.title = muted ? 'Unmute the song' : 'Mute the song';
});
