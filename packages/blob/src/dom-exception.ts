// TODO: Once Node 16 is no more needed internally, we can remove this file and use the native DOMException type.
/* eslint-disable -- fine */
export const DOMException =
  globalThis.DOMException ??
  (() => {
    // DOMException was only made a global in Node v17.0.0,
    // but fetch supports >= v16.8.
    try {
      atob('~');
    } catch (err) {
      return Object.getPrototypeOf(err).constructor;
    }
  })();
