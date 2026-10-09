/** Minimal typed event emitter (no allocations on emit). */
export class Emitter<E extends object> {
  private readonly handlers = new Map<keyof E, Array<(payload: never) => void>>();

  on<K extends keyof E>(key: K, fn: (payload: E[K]) => void): () => void {
    let list = this.handlers.get(key);
    if (!list) {
      list = [];
      this.handlers.set(key, list);
    }
    list.push(fn as (payload: never) => void);
    return () => {
      const l = this.handlers.get(key);
      if (!l) return;
      const i = l.indexOf(fn as (payload: never) => void);
      if (i >= 0) l.splice(i, 1);
    };
  }

  emit<K extends keyof E>(key: K, payload: E[K]): void {
    const list = this.handlers.get(key);
    if (!list) return;
    for (let i = 0; i < list.length; i++) (list[i] as (p: E[K]) => void)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
