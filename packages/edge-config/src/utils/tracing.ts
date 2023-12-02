import type { TracerProvider, Tracer } from '@opentelemetry/api';
import { name as pkgName, version } from '../../package.json';

let tracer: Tracer | undefined;

export function setTracerProvider(tracerProvider: TracerProvider): void {
  tracer = tracerProvider.getTracer(pkgName, version);
}

export function getTracer(): Tracer | undefined {
  return tracer;
}
