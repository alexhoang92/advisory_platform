import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '@hamilton/shared';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If the handler already returned an envelope, pass through
        if (
          data !== null &&
          typeof data === 'object' &&
          'data' in (data as object) &&
          'error' in (data as object)
        ) {
          return data as unknown as ApiResponse<T>;
        }
        return { data, error: null };
      }),
    );
  }
}
