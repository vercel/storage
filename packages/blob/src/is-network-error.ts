/* eslint-disable -- This file is copy pasted*/
// @ts-nocheck -- This file is copy pasted

// Source: https://github.com/sindresorhus/is-network-error/blob/main/index.js
// Why: Jest + ES6 modules = harder than maintaining a nuclear plant

/**
 * MIT License

Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

const objectToString = Object.prototype.toString;

const isError = (value) => objectToString.call(value) === '[object Error]';

const errorMessages = new Set([
  'network error', // Chrome
  'Failed to fetch', // Chrome
  'NetworkError when attempting to fetch resource.', // Firefox
  'The Internet connection appears to be offline.', // Safari 16
  'Load failed', // Safari 17+
  'Network request failed', // `cross-fetch`
  'fetch failed', // Undici (Node.js)
  'terminated', // Undici (Node.js)
]);

export default function isNetworkError(error) {
  const isValid =
    error &&
    isError(error) &&
    error.name === 'TypeError' &&
    typeof error.message === 'string';

  if (!isValid) {
    return false;
  }

  // We do an extra check for Safari 17+ as it has a very generic error message.
  // Network errors in Safari have no stack.
  if (error.message === 'Load failed') {
    return error.stack === undefined;
  }

  return errorMessages.has(error.message);
}
