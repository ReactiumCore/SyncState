import { describe, expect, it, vi } from 'vitest';
import { SyncState, type AppEvent } from '../src';

describe('SyncState', () => {
  it('gets values by string or array path, with defaults', () => {
    const state = new SyncState({ user: { name: 'Ada' }, tasks: ['a', 'b'] });
    expect(state.get('user.name')).toBe('Ada');
    expect(state.get(['tasks', 1])).toBe('b');
    expect(state.get('missing', 42)).toBe(42);
    expect(state.get()).toEqual({ user: { name: 'Ada' }, tasks: ['a', 'b'] });
  });

  it('sets by path and merges plain objects one level', () => {
    const state = new SyncState({ user: { name: 'Ada', age: 36 } });
    state.set('user', { age: 37 });
    expect(state.get('user')).toEqual({ name: 'Ada', age: 37 });
    state.set({ theme: 'dark' });
    expect(state.get()).toEqual({
      user: { name: 'Ada', age: 37 },
      theme: 'dark',
    });
  });

  it('replaces non-plain values instead of merging', () => {
    class Model {
      id = 1;
      hello() {
        return 'hi';
      }
    }
    const state = new SyncState({ list: [1, 2, 3], model: { a: 1 } });
    state.set('list', [4]);
    expect(state.get('list')).toEqual([4]);
    const m = new Model();
    state.set('model', m);
    expect(state.get('model')).toBe(m);
  });

  it('dispatches before-set, set and change events', () => {
    const state = new SyncState({ count: 0 });
    const events: string[] = [];
    let change: AppEvent | undefined;
    state.addEventListener('before-set', () => events.push('before-set'));
    state.addEventListener('set', () => events.push('set'));
    state.addEventListener('change', (e) => {
      events.push('change');
      change = e;
    });

    state.set('count', 1);
    expect(events).toEqual(['before-set', 'set', 'change']);
    expect(change).toMatchObject({ path: 'count', value: 1, previous: 0 });
  });

  it('does not dispatch change when the value is unchanged', () => {
    const state = new SyncState({ a: 1, b: 2 });
    const onChange = vi.fn();
    const onSet = vi.fn();
    state.addEventListener('change', onChange);
    state.addEventListener('set', onSet);
    state.set({ a: 1 });
    state.set('b', 2);
    expect(onSet).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('skips events on silent sets', () => {
    const state = new SyncState();
    const listener = vi.fn();
    state.addEventListener('set', listener);
    state.addEventListener('change', listener);
    state.set('a', 1, true);
    expect(state.get('a')).toBe(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('supports Cache and Enums', () => {
    const state = new SyncState();
    const onCacheSet = vi.fn();
    state.addEventListener('cache-set', onCacheSet);
    state.Cache.set('req', 'pending');
    expect(state.Cache.get('req')).toBe('pending');
    expect(onCacheSet).toHaveBeenCalledOnce();
    state.Cache.del('req');
    expect(state.Cache.get('req')).toBeUndefined();

    expect(state.Enums.get('busy')).toBe('busy');
    state.Enums.set('done', 'done');
    state.Enums.set({ idle: 'idle' });
    expect(state.Enums.get('DONE')).toBe('done');
    expect(state.Enums.get('idle')).toBe('idle');
  });

  it('exposes enum values as properties', () => {
    const state = new SyncState();
    expect(state.Enums.BUSY).toBe('busy');
    expect(state.Enums.ERROR).toBe('error');
    expect(state.Enums.READY).toBe('ready');
    const enums = state.Enums.set({ idle: 'idle' });
    expect(enums.IDLE).toBe('idle');
    expect(state.Enums.IDLE).toBe('idle');
    expect(state.Enums.has('IDLE')).toBe(true);
  });

  it('extends with bound methods', () => {
    const state = new SyncState({ open: false }).extend(
      'toggle',
      function (this: SyncState) {
        return this.set('open', !this.get('open'));
      },
    ) as SyncState & { toggle: () => SyncState };
    state.toggle();
    expect(state.get('open')).toBe(true);
  });
});
