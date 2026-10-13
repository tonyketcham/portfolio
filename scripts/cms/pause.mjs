/** A scoped game clock: editor/network/React work continues while game tasks freeze. */
export function createGameClock(host = globalThis, time = () => performance.now()) {
  let paused = false, stoppedAt = 0, excluded = 0, sequence = 1000000000;
  const tasks = new Map();
  const now = () => (paused ? stoppedAt : time()) - excluded;
  function arm(task) {
    if (paused) return;
    task.native = host.setTimeout(() => {
      if (paused || !tasks.has(task.id)) return;
      if (!task.repeat) tasks.delete(task.id);
      else task.at = now() + Math.max(1, task.delay);
      try { task.callback(...task.args); } finally { if (task.repeat && tasks.has(task.id)) arm(task); }
    }, Math.max(0, task.at - now()));
  }
  function schedule(callback, delay = 0, repeat = false, args = []) {
    const task = { id: ++sequence, callback, delay: Number(delay) || 0, repeat, args, at: now() + (Number(delay) || 0), native: null };
    tasks.set(task.id, task); arm(task); return task.id;
  }
  function clear(id) {
    const task = tasks.get(id);
    if (task) { host.clearTimeout(task.native); tasks.delete(id); }
  }
  function pause(value) {
    if (value === paused) return;
    if (value) { stoppedAt = time(); paused = true; for (const task of tasks.values()) host.clearTimeout(task.native); }
    else { excluded += time() - stoppedAt; paused = false; for (const task of tasks.values()) arm(task); }
  }
  return { now, pause, get paused() { return paused; }, get pending() { return tasks.size; }, timeout: (callback, delay, ...args) => schedule(callback, delay, false, args), interval: (callback, delay, ...args) => schedule(callback, delay, true, args), clear };
}
