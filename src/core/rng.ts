/** Small deterministic PRNG (mulberry32) so sims are reproducible. */
export class Rng {
  constructor(private s = 0x9e3779b9) {}
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(n: number) { return Math.floor(this.next() * n); }
}
