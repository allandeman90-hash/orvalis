import { describe, expect, it } from 'vitest';
import { type FrameInfo, type FrameScheduler, MainLoop } from '../../src/core/mainLoop';

/** Manually driven scheduler standing in for requestAnimationFrame. */
class FakeScheduler implements FrameScheduler {
  private next = 1;
  private pending = new Map<number, (t: number) => void>();
  request(cb: (t: number) => void): number {
    const h = this.next++;
    this.pending.set(h, cb);
    return h;
  }
  cancel(h: number): void {
    this.pending.delete(h);
  }
  get pendingCount(): number {
    return this.pending.size;
  }
  fire(timeMs: number): void {
    const cbs = [...this.pending.values()];
    this.pending.clear();
    for (const cb of cbs) cb(timeMs);
  }
}

const cfg = { stepMs: 10, maxFrameDeltaMs: 250 };

function setup() {
  const sched = new FakeScheduler();
  const log: string[] = [];
  const frames: FrameInfo[] = [];
  const loop = new MainLoop(
    sched,
    {
      fixedUpdate: (ms) => log.push(`step:${ms}`),
      render: (f) => {
        log.push('render');
        frames.push(f);
      },
    },
    cfg,
  );
  return { sched, log, frames, loop };
}

describe('MainLoop', () => {
  it('does nothing until started', () => {
    const { sched, loop } = setup();
    expect(loop.running).toBe(false);
    expect(sched.pendingCount).toBe(0);
  });
  it('first frame renders with zero delta and no simulation step', () => {
    const { sched, log, frames, loop } = setup();
    loop.start();
    sched.fire(123_456); // arbitrary absolute timestamp must not cause a huge first delta
    expect(log).toEqual(['render']);
    expect(frames[0]).toEqual({ frameDeltaMs: 0, alpha: 0, steps: 0, frameIndex: 0 });
  });
  it('runs simulation steps before render, in order', () => {
    const { sched, log, loop } = setup();
    loop.start();
    sched.fire(1000);
    sched.fire(1025);
    expect(log).toEqual(['render', 'step:10', 'step:10', 'render']);
    expect(loop.framesRendered).toBe(2);
    expect(loop.stepsSimulated).toBe(2);
  });
  it('keeps exactly one frame request pending while running', () => {
    const { sched, loop } = setup();
    loop.start();
    loop.start(); // idempotent
    expect(sched.pendingCount).toBe(1);
    sched.fire(0);
    sched.fire(16);
    expect(sched.pendingCount).toBe(1);
  });
  it('stop cancels the pending frame and nothing runs afterwards', () => {
    const { sched, log, loop } = setup();
    loop.start();
    sched.fire(0);
    loop.stop();
    expect(loop.running).toBe(false);
    expect(sched.pendingCount).toBe(0);
    sched.fire(50);
    expect(log).toEqual(['render']);
  });
  it('restart does not replay the time spent stopped', () => {
    const { sched, frames, loop } = setup();
    loop.start();
    sched.fire(0);
    loop.stop();
    loop.start();
    sched.fire(99_999);
    expect(frames.at(-1)?.steps).toBe(0);
  });
  it('stop() from inside fixedUpdate abandons the frame', () => {
    const sched = new FakeScheduler();
    let steps = 0;
    let renders = 0;
    const loop: MainLoop = new MainLoop(
      sched,
      {
        fixedUpdate: () => {
          steps++;
          loop.stop();
        },
        render: () => void renders++,
      },
      cfg,
    );
    loop.start();
    sched.fire(0);
    sched.fire(50); // 5 steps due
    expect(steps).toBe(1);
    expect(renders).toBe(1);
    expect(sched.pendingCount).toBe(0);
  });
  it('a throwing callback does not kill the loop', () => {
    const sched = new FakeScheduler();
    let renders = 0;
    const loop = new MainLoop(
      sched,
      {
        fixedUpdate: () => {},
        render: () => {
          if (renders++ === 0) throw new Error('boom');
        },
      },
      cfg,
    );
    loop.start();
    expect(() => sched.fire(0)).toThrow('boom');
    expect(loop.running).toBe(true);
    sched.fire(16);
    expect(renders).toBe(2);
  });
});
