/**
 * Loaded from karma-test-main after Jasmine is available.
 */
import { TestBed, type TestModuleMetadata } from '@angular/core/testing';
import {
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

const createSpyObj = jasmine.createSpyObj.bind(jasmine);
jasmine.createSpyObj = ((
  baseName: string,
  methodNames: readonly string[] | { [methodName: string]: unknown },
  propertyNames?: { [propertyName: string]: unknown },
) => {
  if (baseName === 'Router') {
    const props = {
      ...(propertyNames ?? {}),
      url: propertyNames?.['url'] ?? '/appointments',
    };
    return createSpyObj(baseName, methodNames, props);
  }
  return createSpyObj(baseName, methodNames, propertyNames);
}) as typeof jasmine.createSpyObj;

const parseJsonHttpErrorBodyInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || typeof err.error !== 'string') {
        return throwError(() => err);
      }
      const trimmed = err.error.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return throwError(() => err);
      }
      try {
        return throwError(
          () =>
            new HttpErrorResponse({
              error: JSON.parse(trimmed) as unknown,
              headers: err.headers,
              status: err.status,
              statusText: err.statusText,
              url: err.url ?? undefined,
            }),
        );
      } catch {
        return throwError(() => err);
      }
    }),
  );

function isBareHttpClientProvider(provider: unknown): boolean {
  if (provider === provideHttpClient) {
    return true;
  }
  if (typeof provider !== 'object' || provider === null || !('ɵproviders' in provider)) {
    return false;
  }
  const entries = (provider as { ɵproviders: unknown[] }).ɵproviders;
  return entries.some((entry) => String(entry).includes('HttpClient'));
}

const configureTestingModule = TestBed.configureTestingModule.bind(TestBed);
TestBed.configureTestingModule = (moduleDef: TestModuleMetadata) => {
  const providers = moduleDef.providers ?? [];
  if (!providers.some(isBareHttpClientProvider)) {
    return configureTestingModule(moduleDef);
  }

  const withoutBareHttp = providers.filter((p) => !isBareHttpClientProvider(p));
  return configureTestingModule({
    ...moduleDef,
    providers: [
      provideHttpClient(withInterceptors([parseJsonHttpErrorBodyInterceptor])),
      ...withoutBareHttp,
    ],
  });
};
