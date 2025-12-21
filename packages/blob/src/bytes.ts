/*!
 * bytes
 * Copyright(c) 2012-2014 TJ Holowaychuk
 * Copyright(c) 2015 Jed Watson
 * MIT Licensed
 */

// from https://github.com/visionmedia/bytes.js/blob/master/index.js
// had too many issues with bundling: https://github.com/vercel/storage/issues/818
type ByteUnit = 'b' | 'kb' | 'mb' | 'gb' | 'tb' | 'pb';

type ByteUnitMap = {
  readonly [_K in ByteUnit]: number;
};

const parseRegExp = /^((-|\+)?(\d+(?:\.\d+)?)) *(kb|mb|gb|tb|pb)$/i;

const map: ByteUnitMap = {
  b: 1,

  kb: 1 << 10,

  mb: 1 << 20,

  gb: 1 << 30,
  tb: 1024 ** 4,
  pb: 1024 ** 5,
};

export function bytes(val: string | number): number | null {
  if (typeof val === 'number' && !Number.isNaN(val)) {
    return val;
  }
  if (typeof val !== 'string') {
    return null;
  }

  const results = parseRegExp.exec(val);
  let floatValue: number;
  let unit: ByteUnit = 'b';

  if (!results) {
    floatValue = parseInt(val, 10);
  } else {
    const [, res, , , unitMatch] = results;
    if (!res) {
      return null;
    }
    floatValue = parseFloat(res);
    if (unitMatch) {
      unit = unitMatch.toLowerCase() as ByteUnit;
    }
  }

  if (Number.isNaN(floatValue)) {
    return null;
  }

  return Math.floor(map[unit] * floatValue);
}
