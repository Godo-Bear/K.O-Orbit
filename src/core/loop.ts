import { SIM_DT } from './constants';

/**
 * Fixed-timestep loop decoupled from rendering. Frame delta is clamped so
 * tab switches / hitches never cause a spiral of death or broken physics.
 */
export class FixedLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  running = false;
  /** Measured render FPS (smoothed) */
  fps = 60;
  /** Average ms spent per simulation step (smoothed) */
  stepMs = 0;
  stepsLastFrame = 0;

  constructor(
    private step: () => void,
    private render: (alpha: number, frameMs: number) => void,
    private maxFrameMs = 100,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    const tick = (now: number) => {
      if (!this.running) return;
      let frame = now - this.last;
      this.last = now;
      if (frame > this.maxFrameMs) frame = this.maxFrameMs; // clamp (alt-tab, GC hitch)
      if (frame < 0) frame = 0;
      this.acc += frame;
      let steps = 0;
      const t0 = performance.now();
      while (this.acc >= SIM_DT && steps < 6) {
        this.step();
        this.acc -= SIM_DT;
        steps++;
      }
      if (steps === 6) this.acc = 0; // drop backlog instead of spiralling
      const t1 = performance.now();
      if (steps > 0) this.stepMs = this.stepMs * 0.9 + ((t1 - t0) / steps) * 0.1;
      this.stepsLastFrame = steps;
      if (frame > 0) this.fps = this.fps * 0.93 + (1000 / frame) * 0.07;
      this.render(this.acc / SIM_DT, frame);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
