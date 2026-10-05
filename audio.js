/* ═══════════════════════════════════════════════════════════
   audio.js — song playback manager.
   Handles preload, gesture-unlock, loop, fade-in, mute.
   ═══════════════════════════════════════════════════════════ */
export class AudioBus {
  constructor(src) {
    this.src = src;
    this.audio = new Audio();
    this.audio.src = src;
    this.audio.preload = 'auto';
    this.audio.loop = true;
    this.audio.volume = 0.85;
    // attach to DOM (hidden) — enables querySelector access & keeps ref alive
    this.audio.setAttribute('aria-hidden', 'true');
    this.audio.style.display = 'none';
    document.body.appendChild(this.audio);
    this.muted = false;
    this.ready = false;
  }

  preload() {
    return new Promise((resolve, reject) => {
      const a = this.audio;
      const done = () => { this.ready = true; resolve(); };
      a.addEventListener('canplaythrough', done, { once: true });
      a.addEventListener('error', () => reject(new Error('audio load failed')), { once: true });
      a.load();
      // safety timeout — resolve anyway after 8s; audio can stream later
      setTimeout(done, 8000);
    });
  }

  async play() {
    // gentle fade-in from silence over ~2.5s
    this.audio.volume = 0;
    try {
      await this.audio.play();
    } catch (err) {
      return new Promise((resolve) => {
        setTimeout(() => this.audio.play().then(resolve).catch(resolve), 100);
      });
    }
    this.fadeTo(0.85, 2500);
  }

  fadeTo(target, ms) {
    const a = this.audio;
    const start = a.volume;
    const t0 = performance.now();
    const step = () => {
      const p = Math.min((performance.now() - t0) / ms, 1);
      a.volume = start + (target - start) * p;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  toggleMute() {
    this.muted = !this.muted;
    this.audio.muted = this.muted;
    return this.muted;
  }

  pause() { this.audio.pause(); }
}
