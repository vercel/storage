export const ERRORS = {
  UNAUTHORIZED: '@vercel/edge-config: Unauthorized',
  EDGE_CONFIG_NOT_FOUND: '@vercel/edge-config: Edge Config not found',
};

export class UnexpectedNetworkError extends Error {
  constructor(res: Response) {
    super(
      `@vercel/edge-config: Unexpected error due to response with status code ${res.status}`,
    );
  }
}
