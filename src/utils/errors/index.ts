export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequest extends AppError {
  constructor(message = "Bad request") {
    super(message, 400);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403);
  }
}
export class NotFound extends AppError {
  constructor(message = "Not found") {
    super(message, 404);
  }
}
export class Conflict extends AppError {
  constructor(message = "Conflict") {
    super(message, 409);
  }
}
export class UniqueConstrainError extends AppError {
  constructor(message = "Duplicate value") {
    super(message, 409);
  }
}
export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
    super(message, 422);
  }
}
