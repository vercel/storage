// TextEncoder and TextDecoder are not defined in Jest dom environment,
// but they are available everywhere else.
// See https://stackoverflow.com/questions/68468203/why-am-i-getting-textencoder-is-not-defined-in-jest
const { TextEncoder, TextDecoder } = require('node:util');
// eslint-disable-next-line import/order -- On purpose to make requiring undici work
const { ReadableStream } = require('node:stream/web');

Object.assign(global, { TextDecoder, TextEncoder, ReadableStream });

const { Request, Response } = require('undici');

Object.assign(global, { Request, Response });
