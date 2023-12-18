import type { DeepReadonly } from 'ts-essentials';
import { hasOwnProperty } from '.';

const lockSymbol = Symbol('lock');

export function isLocked(o: object & { [lockSymbol]?: boolean }): boolean {
  return o[lockSymbol] === true;
}

export function lift<T extends object>(o: DeepReadonly<T>): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

export function lock<T extends object>(o: T): DeepReadonly<T> {
  return new Proxy(o, {
    get(t, p, r) {
      if (p === lockSymbol) return true;

      const value = Reflect.get(t, p, r);

      if (
        hasOwnProperty(t, p) &&
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- k
        value !== null &&
        typeof value === 'object' &&
        !Object.isFrozen(value)
      ) {
        return lock(value);
      }

      if (Array.isArray(value)) {
        return value.map(lock) as DeepReadonly<typeof value>;
      }

      return value;
    },
    getOwnPropertyDescriptor(t, p) {
      const d = Reflect.getOwnPropertyDescriptor(t, p);
      return {
        ...d,
        // we need to set this to true, otherwise we get
        // TypeError: 'getOwnPropertyDescriptor' on proxy: trap reported non-configurability for property 'n' which is either non-existent or configurable in the proxy target
        configurable: true,
        writable: false,
      };
    },
    defineProperty() {
      throw new TypeError(`Cannot modify locked object`);
    },
    deleteProperty() {
      throw new TypeError(`Cannot modify locked object`);
    },
    set() {
      throw new TypeError(`Cannot modify locked object`);
    },
  }) as DeepReadonly<T>;
}
