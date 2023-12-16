import { hasOwnProperty } from '.';
// import type { DeepReadonly } from 'ts-essentials';

const freezeSymbol = Symbol('freeze');

export function isFrozen(o: object & { [freezeSymbol]?: boolean }): boolean {
  return o[freezeSymbol] === true;
}

export function lift<T extends object>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

export function freeze<T extends object>(o: T): Readonly<T> {
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
        return value.map((v) => freeze(v));
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
      throw new TypeError('frozen');
    },
  });
}
