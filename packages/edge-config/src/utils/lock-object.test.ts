import { lock, isLocked, lift } from './lock-object';

describe('lock', () => {
  it('prevents assignment of regular props', () => {
    const o = { n: 1, l: [{}], nested: { name: 'a' } };
    const p = lock(o);

    expect(() => {
      // @ts-expect-error this is exactly what we're testing in case people aren't using ts
      p.n = 2;
    }).toThrow('Cannot modify locked object');
    expect(p).toHaveProperty('n', 1);
  });

  it('prevents pushing onto an array', () => {
    const p = lock({ l: ['a'] });
    expect(() => {
      // @ts-expect-error this is exactly what we're testing in case people aren't using ts
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- k
      p.l.push('b');
    }).toThrow(`Cannot modify locked object`);
    expect(p.l).toHaveLength(1);
  });

  it('prevents popping from array', () => {
    const p = lock({ l: ['a'] });
    expect(() => {
      // @ts-expect-error this is exactly what we're testing in case people aren't using ts
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- k
      p.l.pop();
    }).toThrow(`Cannot modify locked object`);
    expect(p.l).toHaveLength(1);
  });

  it('prevents unshifting array', () => {
    const p = lock({ l: ['a'] });
    expect(() => {
      // @ts-expect-error this is exactly what we're testing in case people aren't using ts
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- k
      p.l.unshift();
    }).toThrow(`Cannot modify locked object`);
    expect(p.l).toHaveLength(1);
  });

  it('prevents deletion', () => {
    const p = lock({ n: 'a' });
    expect(() => {
      // @ts-expect-error this is exactly what we're testing in case people aren't using ts
      delete p.n;
    }).toThrow('Cannot modify locked object');
  });

  it('prevents addition of new properties', () => {
    const p = lock({});
    expect(() => {
      // @ts-expect-error this is exactly what we're testing in case people aren't using ts
      p.someNewProperty = true;
    }).toThrow(`Cannot modify locked object`);
  });

  it('allows calling functions', () => {
    const p = lock({
      x: () => true,
    });
    expect(p.x()).toEqual(true);
  });

  it('prevents functions from mutating object', () => {
    const p = lock({
      y: 1,
      inc() {
        this.y += 1;
      },
    });
    expect(() => {
      p.inc();
    }).toThrow(`Cannot modify locked object`);
  });
});

describe('isLocked', () => {
  it('returns the frozen state', () => {
    const o = {};
    const p = lock(o);
    expect(isLocked(p)).toBe(true);
    expect(isLocked(o)).toBe(false);
  });
});

describe('lift', () => {
  it('clones', () => {
    const o = { n: 1, l: [{ t: 'h' }] };
    const p = lock(o);
    const lifted = lift(p);
    expect(lifted).toEqual({ n: 1, l: [{ t: 'h' }] });
    expect(isLocked(lifted)).toBe(false);
    (lifted as Record<string, unknown>).newProperty = true;
    expect(lifted).toHaveProperty('newProperty', true);
    expect(o).not.toHaveProperty('newProperty');
    expect(p).not.toHaveProperty('newProperty');
  });
});

describe('sealing', () => {
  it('does not appear as sealed', () => {
    expect(Object.isSealed(lock({}))).toBe(false);
  });
});

describe('defineProperty', () => {
  it('throws', () => {
    expect(() =>
      Object.defineProperty(lock({ a: 1 }), 'a', { value: 2 }),
    ).toThrow('Cannot modify locked object');
  });
});

describe('getOwnPropertyDescriptor', () => {
  it('returns a propertyDescriptor', () => {
    // JSON.parse(JSON.stringify(Object.lock({ a: 1 })));
    expect(Object.getOwnPropertyDescriptor(lock({ a: 1 }), 'a')).toEqual({
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
    expect(lock({ a: 1, t: 'hello', n: { a: 2 } }).toString()).toEqual(
      '[object Object]',
    );

    expect(lock({ list: ['a', 'b'] }).list.toString()).toEqual('a,b');
  });
});
