import type { TracerProvider, Tracer, Attributes } from '@opentelemetry/api';
import { name as pkgName, version } from '../../package.json';

let tracerProvider: TracerProvider | undefined;

export function setTracerProvider(nextTracerProvider: TracerProvider): void {
  console.log(
    'Edge Config Tracing: Set a tracing provider',
    nextTracerProvider,
  );
  tracerProvider = nextTracerProvider;
}

function getTracer(): Tracer | undefined {
  return tracerProvider?.getTracer(pkgName, version);
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- bc */
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
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- k
  const traced = function (this: unknown) {
    // eslint-disable-next-line prefer-rest-params -- k
    const args = arguments as unknown as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- k
    const that = this;

    const tracer = getTracer();
    if (!tracer) console.log('Edge Config Tracing: No tracer found.');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- k
    if (!tracer) return fn.apply(that, args);

    console.log('Edge Config Tracing: Starting to trace', options.name);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- k
    return tracer.startActiveSpan(options.name, (span) => {
      console.log('Edge Config Tracing: Start span');
      if (options.tags) span.setAttributes(options.tags);

      try {
        const result = fn.apply(that, args);

        if (result instanceof Promise) {
          result
            .then((value) => {
              if (options.tagSuccess)
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- k
                span.setAttributes(options.tagSuccess(value));
              span.setStatus({ code: 1 }); // 1 = Ok
              span.end();
            })
            .catch((error) => {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- k
              if (options.tagError) span.setAttributes(options.tagError(error));
              span.setStatus({
                code: 2, // 2 = Error
                message: error instanceof Error ? error.message : undefined,
              });
              span.end();
            });
        } else {
          if (options.tagSuccess)
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- k
            span.setAttributes(options.tagSuccess(result));
          span.setStatus({ code: 1 }); // 1 = Ok
          span.end();
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- k
        return result;
      } catch (error: any) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- k
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
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- k */

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
