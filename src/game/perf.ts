/** Frame-time sampler used by the profiling report and the optional `?perf=1` overlay. */
export class PerfMonitor {
  private frames: number[] = [];
  private maxEntities = 0;
  private startedAt = performance.now();

  record(deltaMs: number, entities: number): void {
    if (deltaMs <= 0) return;
    if (this.frames.length < 60 * 60 * 10) this.frames.push(deltaMs);
    if (entities > this.maxEntities) this.maxEntities = entities;
  }

  summary() {
    const f = [...this.frames].sort((a, b) => a - b);
    const n = f.length;
    const avg = n ? f.reduce((a, b) => a + b, 0) / n : 0;
    const pct = (p: number) => (n ? f[Math.min(n - 1, Math.floor(n * p))]! : 0);
    return {
      frames: n,
      seconds: (performance.now() - this.startedAt) / 1000,
      avgFps: avg ? 1000 / avg : 0,
      avgFrameMs: avg,
      p95FrameMs: pct(0.95),
      p99FrameMs: pct(0.99),
      maxFrameMs: n ? f[n - 1]! : 0,
      maxEntities: this.maxEntities,
    };
  }
}
