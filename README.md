# @atomic-reactor/sync-state

A **synchronous** shared state object that you read and write by path and that dispatches events whenever it changes. It works in browsers, React Native and Node.

## Why synchronous?

Every read and write in SyncState happens immediately, so the state is reliable and predictable:

- **Reads see the latest write.** After `set()` returns, the next `get()` returns the new value. Updates are never queued, batched or deferred.
- **Listeners run before `set()` returns.** `before-set`, `set` and `change` fire in that order, in the same call stack, so by the time your next line runs, every subscriber has already reacted.
- **No promises or timing bugs.** There's nothing to `await`, and no stale reads or race conditions between a write and the code that depends on it.
- **Easy to debug.** A stack trace from inside a listener leads straight back to the `set()` that caused it.

```ts
state.set('count', 1);
state.get('count'); // 1, right away
```

```sh
npm install --save @atomic-reactor/sync-state
```

## Usage

```ts
import { SyncState } from '@atomic-reactor/sync-state';

const state = new SyncState({ user: { name: 'Ada' }, tasks: [] });

state.addEventListener('change', (e) => {
  console.log(e.path, e.previous, '→', e.value);
});

state.get('user.name'); // 'Ada'
state.get(['tasks', 0], null); // null (the default)

state.set('user', { age: 36 }); // merges: { name: 'Ada', age: 36 }
state.set('tasks', ['write docs']); // replaces
state.set({ theme: 'dark' }); // merges into the whole state
state.set('theme', 'light', true); // silent: no events
```

## API

### `new SyncState(initialState = {})`

### `get<T>(path?, defaultValue?)`

Returns the value at `path`, or `defaultValue` if nothing is there. With no path, it returns the whole state. A path is a dotted string (`'user.name'`) or an array (`['tasks', 0]`). Each call dispatches `get`.

### `set(path, value, silent?)` / `set(value)`

Sets the value at `path`. With no path, the value is merged into the whole state. If both the old and the new value are plain objects, they are merged one level deep. Any other value (an array, Date, class instance, primitive and so on) replaces the old one. Pass `silent = true` to skip events. Returns the state, so calls can be chained.

Each set dispatches these events:

| Event        | When                                       | Detail                      |
| ------------ | ------------------------------------------ | --------------------------- |
| `before-set` | before the value is written                | `{ path, value }`           |
| `set`        | after every set, whether it changed or not | `{ path, value }`           |
| `change`     | only if the value actually changed         | `{ path, value, previous }` |

The detail fields are set on the event object itself, for example `e.path`.

### `Cache`

Holds values that shouldn't trigger re-renders, such as an in-flight request. It has object-path methods (`get`, `has`, …), and its `set` and `del` dispatch `cache-set` and `cache-del`.

### `Enums`

Holds named constants. Keys are stored in upper case. The defaults are `BUSY`, `ERROR` and `READY`.

```ts
state.Enums.set('done', 'done');
state.Enums.set({ idle: 'idle' });
state.Enums.get('done'); // 'done'
state.Enums.DONE; // 'done'
state.Enums.BUSY; // 'busy'
```

`Enums.set` returns the updated `Enums`, so you can chain calls or read the new value straight away.

### `extend(name, fn)`

Adds `fn` to the state as a method bound to it.

### `dispatch(type, detail?)`

Dispatches a custom event to the state's listeners.

### Events

`SyncState` extends `EventTarget` from [`@atomic-reactor/event-handle`](https://www.npmjs.com/package/@atomic-reactor/event-handle), which this package also re-exports along with `Event`, `AppEvent` and `Listener`.

## React

To use SyncState in React components, install [`@atomic-reactor/use-sync-state`](https://www.npmjs.com/package/@atomic-reactor/use-sync-state). It wraps a `SyncState` in a hook and re-renders the component when the state changes.

```sh
npm install --save @atomic-reactor/use-sync-state
```

It needs React 16.8 or later.

### `useSyncState(initialState?, updateEvent?)`

- `initialState`: the starting state. It is only read on the first render. Defaults to `{}`.
- `updateEvent`: the SyncState event that triggers a re-render. Defaults to `'change'`.

The hook returns a `SyncState`, so you read and write it with the same `get()` and `set()` described above.

```tsx
import { useSyncState } from '@atomic-reactor/use-sync-state';

export function Counter() {
  const state = useSyncState({ count: 0 });

  return (
    <button onClick={() => state.set('count', state.get('count') + 1)}>
      Clicked {state.get('count')} times
    </button>
  );
}
```

When the component re-renders:

- With the default `'change'`, it re-renders only when a `set()` actually changes a value.
- A silent write, `state.set('path', value, true)`, never re-renders.
- Pass `'set'` as `updateEvent` to re-render on every `set()`, whether the value changed or not.

The hook returns the same `SyncState` on every render, so you can use it inside effects and event handlers without adding it to dependency arrays. Because reads are synchronous, a handler always sees the latest value, with no stale closures:

```tsx
useEffect(() => {
  const onKeyDown = () => console.log(state.get('query'));
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}, []);
```

## License

MIT
