import _ from 'underscore';
import op from 'object-path';
import { Event, EventTarget } from '@atomic-reactor/event-handle';

// A path into the state: 'user.name' or ['tasks', 0]
export type Path = string | (string | number)[];

// Values are whatever's stored, so they're typed by the caller:
// state.get<Task[]>('tasks')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Value = any;

// Whether value is an object literal (or Object.create(null)), not an
// array, Date, class instance, etc.
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!_.isObject(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// A state object that UI components and plain code can share. Values are
// read and written by path ('user.name' or ['tasks', 0]) with get/set, and
// every set dispatches events:
//   before-set  before the value changes
//   set         after every set, changed or not
//   change      only when the value actually changed ({ path, value,
//               previous }); subscribe to this to re-render
// Setting a plain object onto a plain object merges them (one level);
// anything else replaces the old value. A set with a third argument of true
// is silent: no events, no re-render.
//
// Cache holds values that shouldn't trigger renders (e.g. an in-flight
// request, so it isn't sent twice); Enums holds named constants.
export class SyncState extends EventTarget {
  stateObj: { state: Value };
  // The enum values themselves, and an object-path wrapper around them
  __enums: Record<string, Value> = {
    BUSY: 'busy',
    ERROR: 'error',
    READY: 'ready',
  };
  __ENUM = op(this.__enums);
  __cache = op({});

  constructor(initialState: Value = {}) {
    super();
    this.stateObj = { state: initialState };
  }

  get Cache() {
    return {
      ...this.__cache,
      del: (key: string) => {
        this.__cache.del(key);
        this.dispatch('cache-del', { key });
        return this.__cache;
      },
      set: (key: string, value: Value) => {
        this.__cache.set(key, value);
        this.dispatch('cache-set', { key, value });
        return this.__cache;
      },
    };
  }

  // The enum values as properties (Enums.BUSY), plus object-path methods.
  // Keys are upper case, so they never collide with the method names.
  get Enums(): Record<string, Value> {
    return {
      ...this.__ENUM,
      ...this.__enums,
      set: (k: string | Record<string, Value>, v?: Value) => {
        if (_.isString(k)) {
          this.__ENUM.set(String(k).toUpperCase(), v);
        }

        if (_.isObject(k)) {
          Object.entries(k).forEach(([key, value]) => {
            this.__ENUM.set(String(key).toUpperCase(), value);
          });
        }

        return this.Enums;
      },
      get: (k: string) => this.__ENUM.get(String(k).toUpperCase()),
    };
  }

  // The value at path (defaultValue if there's none), or the whole state
  // with no path. Dispatches 'get'.
  get = <T = Value>(path?: Path, defaultValue?: T): T => {
    const value =
      _.isString(path) || _.isArray(path)
        ? op.get(this.stateObj.state, path, defaultValue)
        : this.stateObj.state;

    this.dispatch('get', { path, value });
    return value;
  };

  // set(path, value) or set(value): sort out which form was used
  _setArgs = (
    path: Path | false | Value,
    value?: Value,
  ): [Path | false, Value] => {
    // path looks like object path or is explicitly false
    if (
      (path === false || typeof path == 'string' || Array.isArray(path)) &&
      typeof value != 'undefined'
    ) {
      return [path, value];
    }

    // path looks like the value
    return [false, path];
  };

  // The value to store: previous and next merged if both are plain objects,
  // otherwise next
  _conditionallyMerge = (previous: Value, next: Value): Value => {
    const noMergeConditions: ((p: Value, n: Value) => boolean)[] = [
      (p, n) => !_.isObject(p) || !_.isObject(n),
      // Only merge plain objects; spreading a class instance (e.g. a
      // Parse.Object) would copy it into a plain object and drop its methods
      (p, n) => !isPlainObject(p) || !isPlainObject(n),
      (p, n) => typeof p != typeof n,
      (p, n) => _.isElement(n),
      (p, n) => _.isBoolean(n),
      (p, n) => _.isArray(n),
      (p, n) => _.isString(n),
      (p, n) => _.isNumber(n),
      (p, n) => _.isDate(n),
      (p, n) => _.isError(n),
      (p, n) => _.isRegExp(n),
      (p, n) => _.isNull(n),
      (p, n) => _.isSymbol(n),
    ];

    // merge not possible or necessary
    if (
      !_.isEmpty(
        noMergeConditions.filter((condition) => condition(previous, next)),
      )
    ) {
      return next;
    }

    return {
      ...previous,
      ...next,
    };
  };

  // Adds a method to this state, bound to it, e.g.
  // state.extend('toggle', function () { return this.set('open', !this.get('open')); })
  extend = (prop: string, method: (...args: Value[]) => unknown) => {
    if (_.isFunction(method))
      Object.assign(this, { [prop]: method.bind(this) });
    return this;
  };

  // Sets the value at a path (set('a.b', 1)), or merges into the whole
  // state with no path (set({ a: 1 })). Pass silent = true to skip the
  // events. Returns the state, for chaining.
  set = (pathArg: Path | false | Value, valueArg?: Value, silent = false) => {
    const [path, value] = this._setArgs(pathArg, valueArg);

    if (!silent) this.dispatch('before-set', { path, value });

    // eslint-disable-next-line no-useless-assignment
    let changed = false;

    let previous;
    if (path) {
      previous = op.get(this.stateObj.state, path);
      const nextValue = this._conditionallyMerge(
        op.get(this.stateObj.state, path),
        value,
      );
      changed = !_.isEqual(previous, nextValue);
      op.set(this.stateObj.state, path, nextValue);
    } else {
      previous = this.stateObj.state;
      // Compared after merging, so set({ a: 1 }) on { a: 1, b: 2 } isn't a
      // change
      const nextState = this._conditionallyMerge(this.stateObj.state, value);
      changed = !_.isEqual(previous, nextState);
      this.stateObj.state = nextState;
    }

    if (!silent) {
      this.dispatch('set', { path, value });
      if (changed) this.dispatch('change', { path, value, previous });
    }

    return this;
  };

  // Sends an event of `type` with `obj` as its detail to this state's
  // listeners, e.g. state.dispatch('sidebar-toggle')
  dispatch = (type: string, obj: Record<string, unknown> = {}) => {
    this.dispatchEvent(new Event(type, obj));
    return this;
  };
}
