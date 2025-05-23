// TextEncoder and TextDecoder are not defined in Jest dom environment,
// but they are available everywhere else.
// See https://stackoverflow.com/questions/68468203/why-am-i-getting-textencoder-is-not-defined-in-jest
const { TextEncoder, TextDecoder } = require('node:util');
const { ReadableStream } = require('node:stream/web');

Object.assign(global, { TextDecoder, TextEncoder, ReadableStream });
