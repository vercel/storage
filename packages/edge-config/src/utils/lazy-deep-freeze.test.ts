import { freeze, isFrozen, lift } from './lazy-deep-freeze';

describe('freeze', () => {
  it('prevents assignment of regular props', () => {
    const o = { n: 1, l: [{}], nested: { name: 'a' } };
    const p = freeze(o);

    expect(() => {
      // @ts-expect-error this is exactly what we're testing in case people aren't using ts
      p.n = 2;
    }).toThrow('frozen');
    expect(p).toHaveProperty('n', 1);
  });

  it('prevents pushing onto an array', () => {
    const p = freeze({ l: ['a'] });
    expect(() => {
      // @ts-expect-error this is exactly what we're testing in case people aren't using ts
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- k
      p.l.push('b');
    }).toThrow('frozen');
    expect(p.l).toHaveLength(1);
  });

  it('prevents deletion', () => {
    const p = freeze({ n: 'a' });
    expect(() => {
      // @ts-expect-error this is exactly what we're testing in case people aren't using ts
      delete p.n;
    }).toThrow('frozen');
  });

  it('prevents addition of new properties', () => {
    const p = freeze({});
    expect(() => {
      // @ts-expect-error this is exactly what we're testing in case people aren't using ts
      p.someNewProperty = true;
    }).toThrow('frozen');
  });

  it('allows calling functions', () => {
    const p = freeze({
      x: () => true,
    });
    expect(p.x()).toEqual(true);
  });

  it('prevents functions from mutating object', () => {
    const p = freeze({
      y: 1,
      inc() {
        this.y += 1;
      },
    });
    expect(() => {
      p.inc();
    }).toThrow('frozen');
  });
});

describe('isFrozen', () => {
  it('returns the frozen state', () => {
    const o = {};
    const p = freeze(o);
    expect(isFrozen(p)).toBe(true);
    expect(isFrozen(o)).toBe(false);
  });
});

describe('lift', () => {
  it('clones', () => {
    const o = { n: 1, l: [{ t: 'h' }] };
    const p = freeze(o);
    const lifted = lift(p);
    expect(lifted).toEqual({ n: 1, l: [{ t: 'h' }] });
    expect(isFrozen(lifted)).toBe(false);
    (lifted as Record<string, unknown>).newProperty = true;
    expect(lifted).toHaveProperty('newProperty', true);
    expect(o).not.toHaveProperty('newProperty');
    expect(p).not.toHaveProperty('newProperty');
  });
});

describe('sealing', () => {
  it('does not appear as sealed', () => {
    expect(Object.isSealed(freeze({}))).toBe(false);
  });
});

describe('defineProperty', () => {
  it('throws', () => {
    expect(() =>
      Object.defineProperty(freeze({ a: 1 }), 'a', { value: 2 }),
    ).toThrow('frozen');
  });
});

describe('getOwnPropertyDescriptor', () => {
  it('returns a propertyDescriptor', () => {
    // JSON.parse(JSON.stringify(Object.freeze({ a: 1 })));
    expect(Object.getOwnPropertyDescriptor(freeze({ a: 1 }), 'a')).toEqual({
      configurable: true,
      enumerable: true,
      value: 1,
      writable: false,
    });
  });
});

describe('toString', () => {
  it('should stringify like a regular object', () => {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- ok
    expect(freeze({ a: 1, t: 'hello', n: { a: 2 } }).toString()).toEqual(
      '[object Object]',
    );

    expect(freeze({ list: ['a', 'b'] }).list.toString()).toEqual('a,b');
  });
});
