import { trace } from './tracing';

function deepFreezeRaw<T>(obj: T): Readonly<T> {
  Object.freeze(obj);

  Object.getOwnPropertyNames(obj).forEach((name) => {
    const prop = obj[name as keyof typeof obj];
    const type = typeof prop;

    // Freeze prop if it is an object or function and also not already frozen
    if ((type === 'object' || type === 'function') && !Object.isFrozen(prop)) {
      deepFreezeRaw(prop);
    }
  });

  return obj;
}

export const deepFreeze = trace(deepFreezeRaw, { name: 'deepFreeze' });
