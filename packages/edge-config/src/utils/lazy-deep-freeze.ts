import type { DeepReadonly } from 'ts-essentials';
import { hasOwnProperty } from '.';

const freezeSymbol = Symbol('freeze');

export function isFrozen(o: object & { [freezeSymbol]?: boolean }): boolean {
  return o[freezeSymbol] === true;
}

export function lift<T extends object>(o: DeepReadonly<T>): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

export function freeze<T extends object>(o: T): DeepReadonly<T> {
  return new Proxy(o, {
    get(t, p, r) {
      if (p === freezeSymbol) return true;

      const oIsFunction = typeof o === 'function';

      const value = Reflect.get(t, p, r);

      if (
        hasOwnProperty(t, p) &&
        (oIsFunction
          ? p !== 'caller' && p !== 'callee' && p !== 'arguments'
          : true) &&
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- k
        value !== null &&
        (typeof value === 'object' || typeof value === 'function') &&
        !Object.isFrozen(value)
      ) {
        return freeze(value);
      }

      if (Array.isArray(value)) {
        return value.map(freeze) as DeepReadonly<typeof value>;
      }

      return value;
    },
    getOwnPropertyDescriptor(t, p) {
      const d = Reflect.getOwnPropertyDescriptor(t, p);
      return {
        ...d,
        configurable: true,
        writable: false,
      };
    },
    isExtensible() {
      return false;
    },
    defineProperty() {
      throw new TypeError('frozen');
    },
    deleteProperty() {
      throw new TypeError('frozen');
    },
    set() {
      // TypeError: Cannot assign to read only property 'name' of object '#<Object>'
      throw new TypeError('frozen');
    },
  }) as DeepReadonly<T>;
}
