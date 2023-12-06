import type { TracerProvider, Tracer } from '@opentelemetry/api';
import { name as pkgName, version } from '../../package.json';

let tracer: Tracer | undefined;

export function setTracerProvider(tracerProvider: TracerProvider): void {
  tracer = tracerProvider.getTracer(pkgName, version);
}

function getTracer(): Tracer | undefined {
  return tracer;
}

export function trace<F extends Function>(
  fn: F,
  options: {
    name: string;
    tags?: Record<string, string | number | boolean>;
  } = {
    name: fn.name,
  },
): F {
  const traced = function (this: unknown) {
    const args = arguments as unknown as unknown[];
    const that = this;

    const tracer = getTracer();
    if (!tracer) return fn.apply(that, args);

    const span = tracer.startSpan(options.name);
    if (options.tags) span.setAttributes(options.tags);

    try {
      const result = fn.apply(that, args);

      if (result instanceof Promise) {
        result
          .then(() => {
            span.setStatus({ code: 1 }); // 1 = Ok
          })
          .catch((error) => {
            span.setStatus({
              code: 2, // 2 = Error
              message: error instanceof Error ? error.message : undefined,
            });
          });
      } else {
        span.setStatus({ code: 1 }); // 1 = Ok
        span.end();
      }

      return result;
    } catch (error) {
      span.setStatus({
        code: 2, // 2 = Error
        message: error instanceof Error ? error.message : undefined,
      });

      span.end();

      throw error;
    }
  };

  return traced as unknown as F;
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
