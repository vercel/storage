import type { TraceAPI, Tracer, Attributes } from '@opentelemetry/api';
import { name as pkgName, version } from '../../package.json';

let traceApi: TraceAPI | null = null;

/**
 * Initalizes the tracing for the Edge Config by trying to load
 * the `@opentelemetry/api` package.
 */
export async function initTracing() {
  try {
    traceApi = require('@opentelemetry/api').trace;
  } catch (error) {
    console.error(
      '@vercel/edge-config: Failed to load `@opentelemetry/api`',
      error,
    );
  }

  try {
    if (traceApi === null) {
      const otel = await import('@opentelemetry/api');
      traceApi = otel.trace;
    }
  } catch (error) {
    console.error(
      '@vercel/edge-config: Failed to load `@opentelemetry/api`',
      error,
    );
  }
}

function getTracer(): Tracer | undefined {
  return traceApi?.getTracer(pkgName, version);
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
    /** Defaults to `true`. If set to `false`, it'll trace regardless of `EDGE_CONFIG_TRACE_VERBOSE`. */
    isVerboseTrace?: boolean;
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

    const shouldTrace =
      process.env.EDGE_CONFIG_TRACE_VERBOSE === 'true' ||
      options.isVerboseTrace === false;
    if (!shouldTrace) return fn.apply(this, args);

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
