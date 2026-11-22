export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, message, details);
export const notFound = (message = 'Not found') => new AppError(404, message);
export const conflict = (message: string, details?: unknown) =>
  new AppError(409, message, details);
export const forbidden = (message: string, details?: unknown) =>
  new AppError(403, message, details);
