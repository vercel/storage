// adds types to the untyped proxy-clone npm package
declare module 'proxy-clone' {
  // eslint-disable-next-line import/no-default-export -- k
  export default function clone<T>(x: T): T;
}
