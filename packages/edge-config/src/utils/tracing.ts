import type { TracerProvider, Tracer, Attributes } from '@opentelemetry/api';
import { name as pkgName, version } from '../../package.json';

let tracer: TracerProvider | undefined;

export function setTracerProvider(tracerProvider: TracerProvider): void {
  tracer = tracerProvider;
}

function getTracer(): Tracer | undefined {
  return tracer?.getTracer(pkgName, version);
}

export function trace<F extends (...args: any) => any>(
  fn: F,
  options: {
    name: string;
    tags?: Record<string, string | number | boolean>;
    tagSuccess?: (
      result: ReturnType<F> extends PromiseLike<infer U> ? U : ReturnType<F>,
    ) => Attributes;
    tagError?: (error: Error) => Attributes;
  } = {
    name: fn.name,
  },
): F {
  const traced = function (this: unknown) {
    const args = arguments as unknown as unknown[];
    const that = this;

    const tracer = getTracer();
    if (!tracer) return fn.apply(that, args);

    return tracer.startActiveSpan(options.name, (span) => {
      if (options.tags) span.setAttributes(options.tags);

      try {
        const result = fn.apply(that, args);

        if (result instanceof Promise) {
          result
            .then((value) => {
              if (options.tagSuccess)
                span.setAttributes(options.tagSuccess(value));
              span.setStatus({ code: 1 }); // 1 = Ok
              span.end();
            })
            .catch((error) => {
              if (options.tagError) span.setAttributes(options.tagError(error));
              span.setStatus({
                code: 2, // 2 = Error
                message: error instanceof Error ? error.message : undefined,
              });
              span.end();
            });
        } else {
          if (options.tagSuccess)
            span.setAttributes(options.tagSuccess(result));
          span.setStatus({ code: 1 }); // 1 = Ok
          span.end();
        }

        return result;
      } catch (error: any) {
        if (options.tagError) span.setAttributes(options.tagError(error));

        span.setStatus({
          code: 2, // 2 = Error
          message: error instanceof Error ? error.message : undefined,
        });

        span.end();

        throw error;
      }
    });
  };

  return traced as unknown as F;
}

export function measure(label: string): (reason?: string) => void {
  const start = Date.now();
  return (reason) => {
    if (reason) {
      // eslint-disable-next-line no-console -- k
      console.log(label, reason, Date.now() - start);
    } else {
      // eslint-disable-next-line no-console -- k
      console.log(label, Date.now() - start);
    }
  };
}
