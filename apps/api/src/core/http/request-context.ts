import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  readonly correlationId: string;
  readonly userId?: string;
  readonly organizationId?: string;
  readonly sessionId?: string;
}

export interface AuthenticatedRequestContext extends RequestContext {
  readonly userId: string;
  readonly organizationId: string;
  readonly sessionId: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => T,
): T {
  return requestContextStorage.run(context, callback);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function isAuthenticatedRequestContext(
  context: RequestContext | undefined,
): context is AuthenticatedRequestContext {
  return Boolean(
    context?.userId && context.organizationId && context.sessionId,
  );
}
