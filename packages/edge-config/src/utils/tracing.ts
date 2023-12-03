import type { TracerProvider, Tracer } from '@opentelemetry/api';
import { name as pkgName, version } from '../../package.json';

let tracer: Tracer | undefined;

export function setTracerProvider(tracerProvider: TracerProvider): void {
  tracer = tracerProvider.getTracer(pkgName, version);
}

export function getTracer(): Tracer | undefined {
  return tracer;
}

export function measure(label: string): (reason?: string) => void {
  const start = performance.now();
  return (reason) => {
    if (reason) {
      // eslint-disable-next-line no-console -- k
      console.log(label, reason, performance.now() - start);
    } else {
      // eslint-disable-next-line no-console -- k
      console.log(label, performance.now() - start);
    }
  };
}
