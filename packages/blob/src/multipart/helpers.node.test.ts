import { Readable } from 'node:stream';
import { toReadableStream } from './helpers';

describe('toReadableStream', () => {
  it('converts a Node.js stream to a Web stream', async () => {
    const stream = await toReadableStream(
      Readable.from([Buffer.from('hello '), Buffer.from('world')]),
    );

    await expect(new Response(stream).text()).resolves.toBe('hello world');
  });

  it('destroys the Node.js stream when the Web stream is cancelled', async () => {
    const source = Readable.from([Buffer.from('hello')]);
    const destroy = jest.spyOn(source, 'destroy');
    const stream = await toReadableStream(source);
    const reason = new Error('cancelled');

    await stream.cancel(reason);

    expect(destroy).toHaveBeenCalledWith(reason);
  });
});
