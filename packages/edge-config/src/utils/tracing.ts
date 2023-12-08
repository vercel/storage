import {
  trace as traceApi,
  type Tracer,
  type Attributes,
} from '@opentelemetry/api';
import { name as pkgName, version } from '../../package.json';

function getTracer(): Tracer | null {
  return traceApi.getTracer(pkgName, version);
}

function isPromise<T>(p: unknown): p is Promise<T> {
  return (
    p !== null &&
    typeof p === 'object' &&
    'then' in p &&
    typeof p.then === 'function'
  );
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- bc */
export function trace<F extends (...args: any) => any>(
  fn: F,
  options: {
    name: string;
    attributes?: Attributes;
    attributesSuccess?: (
      result: ReturnType<F> extends PromiseLike<infer U> ? U : ReturnType<F>,
    ) => Attributes;
    attributesError?: (error: Error) => Attributes;
  } = {
    name: fn.name,
  },
): F {
  const traced = function (this: unknown, ...args: unknown[]): unknown {
    const tracer = getTracer();
    if (!tracer) return fn.apply(this, args);

    return tracer.startActiveSpan(options.name, (span) => {
      if (options.attributes) span.setAttributes(options.attributes);

      try {
        const result = fn.apply(this, args);

        if (isPromise(result)) {
          result
            .then((value) => {
              if (options.attributesSuccess) {
                span.setAttributes(
                  options.attributesSuccess(
                    value as ReturnType<F> extends PromiseLike<infer U>
                      ? U
                      : ReturnType<F>,
                  ),
                );
              }

              span.setStatus({ code: 1 }); // 1 = Ok
              span.end();
            })
            .catch((error) => {
              if (options.attributesError) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- k
                span.setAttributes(options.attributesError(error));
              }

              span.setStatus({
                code: 2, // 2 = Error
                message: error instanceof Error ? error.message : undefined,
              });

              span.end();
            });
        } else {
          if (options.attributesSuccess) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- k
            span.setAttributes(options.attributesSuccess(result));
          }

          span.setStatus({ code: 1 }); // 1 = Ok
          span.end();
        }

        return result as unknown;
      } catch (error: any) {
        if (options.attributesError) {
          span.setAttributes(options.attributesError(error as Error));
        }

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
