import type { Renderer } from './renderer';

/**
 * Dynamic resolution: keeps the game at (up to) native 4K while it runs smoothly, and lowers the
 * render resolution in small steps when frames take too long — then probes back up later.
 * Measures real frame intervals (covers GPU fill-rate limits that JS timers can't see).
 */
const STEPS = [1, 0.9, 0.8, 0.7, 0.6, 0.5];

export class AdaptiveResolution {
  private step = 0;
  private samples: number[] = [];
  private refresh = 1000 / 60; // detected display refresh interval
  private settleUntil = 0;
  private goodSince = 0;
  private upCooldown = 6000; // ms of smooth play before trying a higher resolution
  private lastUpAt = 0;
  private lastStep = 0;

  constructor(private r: Renderer) {}

  /** Call once per rendered frame with the frame interval (ms). */
  frame(dt: number, now: number) {
    if (this.r.mode !== 0) return;
    if (document.hidden || dt <= 0 || dt > 250) return; // tab switch / hitch: ignore
    if (now < this.settleUntil) return;
    this.samples.push(dt);
    if (this.samples.length < 45) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    this.samples.length = 0;
    const median = sorted[Math.floor(sorted.length * 0.5)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    // learn the display's refresh interval (60/120/144 Hz…) from the fastest typical frames
    const fast = sorted[Math.floor(sorted.length * 0.1)];
    this.refresh = Math.min(this.refresh * 0.8 + fast * 0.2, 1000 / 30);
    // target: at least 60 FPS (or the display rate if it's lower)
    const budget = Math.max(this.refresh, 1000 / 60) * 1.18;
    if (median > budget || p90 > budget * 1.6) {
      // too slow: step resolution down (bigger step when far over budget)
      const over = median / budget;
      const jump = over > 1.6 ? 2 : 1;
      if (this.step < STEPS.length - 1) {
        // if we only just stepped up and it got slow, back off for longer before trying again
        if (this.lastStep > this.step && now - this.lastUpAt < 4000) this.upCooldown = Math.min(60000, this.upCooldown * 2);
        this.set(Math.min(STEPS.length - 1, this.step + jump), now);
      }
      this.goodSince = 0;
      return;
    }
    if (median < budget * 0.88 && p90 < budget * 1.15) {
      if (!this.goodSince) this.goodSince = now;
      if (this.step > 0 && now - this.goodSince > this.upCooldown) { this.lastUpAt = now; this.set(this.step - 1, now); this.goodSince = 0; }
    } else this.goodSince = 0;
  }

  private set(step: number, now: number) {
    this.lastStep = this.step;
    this.step = step;
    this.r.setAutoScale(STEPS[step]);
    this.settleUntil = now + 700; // let the new size settle before measuring again
  }

  reset() { this.step = 0; this.samples.length = 0; this.goodSince = 0; this.upCooldown = 6000; this.r.setAutoScale(1); }
  get scale() { return STEPS[this.step]; }
}
