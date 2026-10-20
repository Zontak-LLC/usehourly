import {
  ease,
  nextIndex,
  scrollDistance,
  scrollDuration,
  TOUR_END_MS,
  TOUR_HOLD_MS,
  TOUR_START_MS,
  TOUR_SWIPE_MS,
} from "./tour-timing";

/** What the running tour reads, and what the page writes to it (hover, focus, the dots, Pause, being on screen). */
export type TourState = {
  index: number;
  paused: boolean;
  hover: boolean;
  focus: boolean;
  visible: boolean;
  /** A dot was pressed: the screen to go to at once. */
  jump: number | null;
};

type Parts = {
  state: TourState;
  count: number;
  screen: () => HTMLElement | null;
  track: () => HTMLElement | null;
  image: (i: number) => HTMLImageElement | null | undefined;
  setIndex: (i: number) => void;
};

const nothing = () => undefined;

/**
 * Runs the tour: each screen rests, scrolls down inside the window, rests again, then the track slides to the next
 * one, round and round. Time stands still while the pointer or focus is on it, the tour is off screen or hidden, or
 * Pause was chosen; a dot ends whatever is happening and goes straight to its screen. Returns the function that stops it.
 */
export function startTour(p: Parts): () => void {
  let alive = true;
  const s = p.state;
  const stopped = () => s.paused || s.hover || s.focus || !s.visible || document.hidden;

  // Runs fn(0..1) over ms. Time does not advance while stopped; a pressed dot or stopping the tour ends it at once.
  const run = (ms: number, fn: (progress: number) => void) =>
    new Promise<void>((done) => {
      let last = performance.now();
      let t = 0;
      const frame = (now: number) => {
        if (!alive || s.jump !== null) return done();
        if (!stopped()) t += now - last;
        last = now;
        fn(Math.min(1, t / ms));
        if (t >= ms) return done();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  const wait = (ms: number) => run(ms, nothing);

  const show = (i: number) => {
    s.index = i;
    const track = p.track();
    if (track) track.style.transform = `translateX(${-100 * i}%)`;
    p.setIndex(i);
  };

  /** Rest at the top, then scroll a tall page (or just hold a short one). */
  async function dwell(i: number) {
    const img = p.image(i);
    if (img) {
      img.style.transform = "translateY(0)";
      await img.decode?.().catch(nothing); // measure only once the picture is in: before that its height is 0
    }
    await wait(TOUR_START_MS);
    if (!alive || s.jump !== null) return;
    const over = scrollDistance(img?.getBoundingClientRect().height ?? 0, p.screen()?.clientHeight ?? 0);
    if (!img || over <= 0) return void (await wait(TOUR_HOLD_MS));
    await run(scrollDuration(over), (t) => {
      img.style.transform = `translateY(${-over * ease(t)}px)`;
    });
    await wait(TOUR_END_MS);
  }

  /** Slide to the screen a dot asked for, or to the next one. */
  async function leave(i: number) {
    if (s.jump !== null) {
      const to = s.jump;
      s.jump = null;
      show(to);
      await wait(TOUR_SWIPE_MS);
      return;
    }
    show(nextIndex(i, p.count));
    await run(TOUR_SWIPE_MS, nothing);
    const left = p.image(i);
    if (left) left.style.transform = "translateY(0)";
  }

  (async () => {
    while (alive) {
      const i = s.index;
      await dwell(i);
      if (alive) await leave(i);
    }
  })();

  return () => {
    alive = false;
  };
}
