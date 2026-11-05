/**
 * A tiny stand-in for React's useState and useEffect, so a hook (or a component that only uses those two) can run in
 * the node test environment with fake timers: there is no DOM here to mount into. A test mocks "react" with
 * `hookRuntime`, then `mount(render, props)` renders once, runs the effects like React does (the last cleanup first,
 * only when a dependency changed), and renders again whenever a state setter changes a value.
 *
 *   vi.mock("react", async (real) => ({ ...(await real<object>()), ...(await import("./helpers/hook-runtime")).hookRuntime }));
 */
type Effect = { deps?: readonly unknown[]; cleanup?: () => void };
type Instance = {
  slots: unknown[];
  effects: Effect[];
  queue: (() => void)[];
  stateAt: number;
  effectAt: number;
  update: () => void;
};

let rendering: Instance | null = null;

function current(): Instance {
  if (!rendering) throw new Error("A hook ran outside mount()");
  return rendering;
}

const sameDeps = (a?: readonly unknown[], b?: readonly unknown[]) =>
  !!a && !!b && a.length === b.length && a.every((d, k) => Object.is(d, b[k]));

export const hookRuntime = {
  useState<T>(initial: T): [T, (next: T) => void] {
    const instance = current();
    const at = instance.stateAt++;
    if (!(at in instance.slots)) instance.slots[at] = initial;
    const set = (next: T) => {
      if (Object.is(instance.slots[at], next)) return;
      instance.slots[at] = next;
      instance.update();
    };
    return [instance.slots[at] as T, set];
  },
  useEffect(run: () => undefined | (() => void), deps?: readonly unknown[]) {
    const instance = current();
    const at = instance.effectAt++;
    const before = instance.effects[at];
    if (before && sameDeps(before.deps, deps)) return;
    instance.queue.push(() => {
      before?.cleanup?.();
      const effect: Effect = { deps };
      instance.effects[at] = effect; // before running it, so a render its setState causes sees it as done
      effect.cleanup = run() ?? undefined;
    });
  },
};

export function mount<P, R>(render: (props: P) => R, initialProps: P) {
  let props = initialProps;
  let value = undefined as R;
  let mounted = true;
  const instance: Instance = { slots: [], effects: [], queue: [], stateAt: 0, effectAt: 0, update };
  function update() {
    if (!mounted) return;
    const outer = rendering;
    rendering = instance;
    instance.stateAt = 0;
    instance.effectAt = 0;
    try {
      value = render(props);
    } finally {
      rendering = outer;
    }
    for (const run of instance.queue.splice(0)) run();
  }
  update();
  return {
    get value() {
      return value;
    },
    rerender(next: P) {
      props = next;
      update();
    },
    unmount() {
      mounted = false;
      for (const effect of instance.effects) effect?.cleanup?.();
    },
  };
}
