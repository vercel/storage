import { freeze, isFrozen, lift } from './lazy-deep-freeze';

describe('freeze', () => {
  it('freezes', () => {
    const o = { n: 1, l: [{}], nested: { name: 'a' } };
    const p = freeze(o);

    expect(() => {
      // @ts-expect-error this is exactly what we're testing in case people aren't using ts
      p.n = 2;
    }).toThrow('frozen');

    expect(p).toHaveProperty('n', 1);

    expect(() => {
      p.l.push('a');
    }).toThrow('frozen');
    expect(p.l).toHaveLength(1);

    expect(() => {
      // @ts-expect-error this is exactly what we're testing in case people aren't using ts
      delete p.n;
    }).toThrow('frozen');

    expect(() => {
      // @ts-expect-error this is exactly what we're testing in case people aren't using ts
      p.someNewProperty = true;
    }).toThrow('frozen');

    expect(isFrozen(p)).toBe(true);
    expect(isFrozen(o)).toBe(false);
    // expect(Object.isFrozen(p)).toBeTruthy();
    // expect(Object.isFrozen(p.l[0])).toBeTruthy();
  });

  it('lifts', () => {
    const o = { n: 1, l: [{}] };
    const p = freeze(o);
    const lifted = lift(p);
    expect(lifted).toEqual({ n: 1, l: [{}] });
    expect(isFrozen(lifted)).toBe(false);
  });
});
