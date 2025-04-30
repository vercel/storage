export function capitalizeFirstLetter(string: string): string {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function getFilenameFromUrl(url: string): string {
  const file = url.split('/').pop();

  if (file === undefined) {
    throw new Error('Invalid URL');
  }

  return file;
}
