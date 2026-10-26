export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ReadonlyArray<{ field: string; message: string }>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
