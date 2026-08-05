import { ERROR_CODES, type ErrorDetail } from '@msd/contracts';

/**
 * Error de aplicacion. Lleva el status HTTP y el `code` que el frontend
 * traduce. El `message` es tecnico y solo llega a los logs.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: ErrorDetail[];

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static validation(message: string, details?: ErrorDetail[]): AppError {
    return new AppError(400, ERROR_CODES.VALIDATION_ERROR, message, details);
  }

  static ipNotAllowed(): AppError {
    return new AppError(403, ERROR_CODES.IP_NOT_ALLOWED, 'Request origin is not allowed');
  }

  static unsupportedSpecialty(specialty: string): AppError {
    return new AppError(
      422,
      ERROR_CODES.SPECIALTY_NOT_SUPPORTED,
      `Specialty "${specialty}" is not in the supported catalog`,
    );
  }

  static unsupportedZone(zone: string): AppError {
    return new AppError(
      422,
      ERROR_CODES.ZONE_NOT_SUPPORTED,
      `Zone "${zone}" is not one of the 22 valid zones of Guatemala City`,
    );
  }

  static importCooldownActive(): AppError {
    return new AppError(
      429,
      ERROR_CODES.PLACE_IMPORT_COOLDOWN_ACTIVE,
      'This keyword and zone were synchronized recently',
    );
  }

  static providerUnavailable(message: string): AppError {
    return new AppError(503, ERROR_CODES.PLACES_PROVIDER_UNAVAILABLE, message);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, message);
  }

  static rateLimited(): AppError {
    return new AppError(429, ERROR_CODES.RATE_LIMIT_EXCEEDED, 'Too many requests');
  }
}
