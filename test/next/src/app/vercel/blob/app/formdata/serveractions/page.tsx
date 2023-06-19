import { put } from '@vercel/blob';

export const runtime = 'edge';

export default function Page(): JSX.Element {
  async function onSubmit(formData: FormData): Promise<void> {
    'use server';
    const file = formData.get('file') as File;
    // this fails because it only sends part of the file, see:
    // https://vercel.slack.com/archives/C03S8ED1DKM/p1683898769152129
    const res = await put(file.name, file.stream(), {
      access: 'public',
    });
    // eslint-disable-next-line no-console
    console.log(res);
  }

  return (
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    <form action={onSubmit}>
      <input name="file" required type="file" />
      <button type="submit">Upload</button>
    </form>
  );
}
