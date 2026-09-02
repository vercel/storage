import { Readable } from 'node:stream';
import { toReadableStream } from './helpers';

it('converts a Node.js stream to a Web stream', async () => {
  const stream = await toReadableStream(
    Readable.from([Buffer.from('hello '), Buffer.from('world')]),
  );

  await expect(new Response(stream).text()).resolves.toBe('hello world');
});

it('destroys the source stream when cancelled', async () => {
  const source = Readable.from([Buffer.from('hello')]);
  const destroy = jest.spyOn(source, 'destroy');
  const stream = await toReadableStream(source);

  await stream.cancel('cancelled');

  expect(destroy).toHaveBeenCalledWith('cancelled');
});

it('forwards source stream errors', async () => {
  const error = new Error('failed');
  const source = new Readable({
    read() {
      this.destroy(error);
    },
  });
  const stream = await toReadableStream(source);

  await expect(stream.getReader().read()).rejects.toBe(error);
});
