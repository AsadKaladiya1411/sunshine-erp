import type {
  AuthenticatedUserIdentity,
  LoginRequest,
} from "../auth/auth.types";

interface ApiSuccess<TData> {
  readonly success: true;
  readonly data: TData;
}

interface ApiErrorDetail {
  readonly source: "body" | "params" | "query";
  readonly path: readonly (string | number)[];
  readonly message: string;
}

interface StandardApiErrorBody {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: readonly ApiErrorDetail[];
  };
}

interface AccessTokenData {
  readonly accessToken: string;
  readonly tokenType: "Bearer";
  readonly expiresIn: number;
}

interface LoginResponseData extends AccessTokenData {
  readonly user: AuthenticatedUserIdentity;
}

interface RequestOptions extends RequestInit {
  readonly authenticated?: boolean;
}

const refreshLockName = "sunshine-erp-auth-refresh";

export type WebFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number | null,
    public readonly details?: readonly ApiErrorDetail[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function configuredApiBaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || undefined;
}

function normalizeApiBaseUrl(value: string | undefined): string {
  if (!value) {
    throw new ApiError(
      "WEB_API_CONFIGURATION_ERROR",
      "The Web API connection is not configured.",
      null,
    );
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported API protocol.");
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    throw new ApiError(
      "WEB_API_CONFIGURATION_ERROR",
      "The Web API connection is not configured correctly.",
      null,
    );
  }
}

function isStandardApiError(value: unknown): value is StandardApiErrorBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const error = Reflect.get(value, "error");
  return (
    Reflect.get(value, "success") === false &&
    typeof error === "object" &&
    error !== null &&
    typeof Reflect.get(error, "code") === "string" &&
    typeof Reflect.get(error, "message") === "string"
  );
}

function isApiSuccess<TData>(value: unknown): value is ApiSuccess<TData> {
  return (
    typeof value === "object" &&
    value !== null &&
    Reflect.get(value, "success") === true &&
    "data" in value
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export class AuthenticationApiClient {
  private accessToken: string | null = null;
  private refreshPromise: Promise<string> | null = null;
  private authenticationGeneration = 0;
  private authenticationLostHandler: (() => void) | null = null;

  constructor(
    private readonly baseUrl: string | undefined = configuredApiBaseUrl(),
    private readonly fetchImplementation: WebFetch = globalThis.fetch.bind(
      globalThis,
    ),
    private readonly correlationIdFactory: () => string = () =>
      globalThis.crypto.randomUUID(),
  ) {}

  setAuthenticationLostHandler(handler: (() => void) | null): void {
    this.authenticationLostHandler = handler;
  }

  hasAccessToken(): boolean {
    return this.accessToken !== null;
  }

  async login(input: LoginRequest): Promise<AuthenticatedUserIdentity> {
    const result = await this.send<LoginResponseData>(
      "/api/v1/auth/login",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      false,
    );
    this.accessToken = result.accessToken;
    return result.user;
  }

  async restoreSession(): Promise<AuthenticatedUserIdentity> {
    await this.refreshAccessToken();
    return this.send<AuthenticatedUserIdentity>(
      "/api/v1/auth/me",
      {
        method: "GET",
        authenticated: true,
      },
      false,
    );
  }

  getCurrentUser(): Promise<AuthenticatedUserIdentity> {
    return this.send<AuthenticatedUserIdentity>("/api/v1/auth/me", {
      method: "GET",
      authenticated: true,
    });
  }

  async logout(): Promise<void> {
    try {
      if (this.accessToken) {
        await this.send<{ readonly loggedOut: true }>(
          "/api/v1/auth/logout",
          {
            method: "POST",
            authenticated: true,
          },
        );
      }
    } finally {
      this.clearAuthentication();
    }
  }

  request<TData>(path: string, options: RequestOptions = {}): Promise<TData> {
    return this.send<TData>(path, options);
  }

  private refreshAccessToken(): Promise<string> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.performCoordinatedRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }

    return this.refreshPromise;
  }

  private performCoordinatedRefresh(): Promise<string> {
    const lockManager =
      typeof navigator === "undefined" ? undefined : navigator.locks;

    if (!lockManager) {
      return this.performRefresh();
    }

    return lockManager
      .request(refreshLockName, () => this.performRefresh())
      .then((refreshResult) => refreshResult);
  }

  private async performRefresh(): Promise<string> {
    const authenticationGeneration = this.authenticationGeneration;

    try {
      const result = await this.send<AccessTokenData>(
        "/api/v1/auth/refresh",
        { method: "POST" },
        false,
      );

      if (authenticationGeneration !== this.authenticationGeneration) {
        throw new ApiError(
          "AUTHENTICATION_STATE_CHANGED",
          "Authentication state changed while the session was refreshing.",
          null,
        );
      }

      this.accessToken = result.accessToken;
      return result.accessToken;
    } catch (error: unknown) {
      if (authenticationGeneration === this.authenticationGeneration) {
        this.clearAuthentication();
      }
      throw error;
    }
  }

  private clearAuthentication(): void {
    const hadAccessToken = this.accessToken !== null;
    this.authenticationGeneration += 1;
    this.accessToken = null;

    if (hadAccessToken) {
      this.authenticationLostHandler?.();
    }
  }

  private async send<TData>(
    path: string,
    options: RequestOptions,
    allowRefresh = true,
  ): Promise<TData> {
    const { authenticated = false, ...requestInit } = options;
    const accessTokenUsed = authenticated ? this.accessToken : null;
    const headers = new Headers(requestInit.headers);
    headers.set("Accept", "application/json");
    headers.set("X-Correlation-ID", this.correlationIdFactory());

    if (requestInit.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (accessTokenUsed) {
      headers.set("Authorization", `Bearer ${accessTokenUsed}`);
    }

    const requestUrl = `${normalizeApiBaseUrl(this.baseUrl)}${path}`;
    let response: Response;
    try {
      response = await this.fetchImplementation(
        requestUrl,
        {
          ...requestInit,
          credentials: "include",
          headers,
        },
      );
    } catch {
      throw new ApiError(
        "NETWORK_ERROR",
        "Unable to connect to the Sunshine ERP API.",
        null,
      );
    }

    if (response.status === 401 && authenticated && allowRefresh) {
      if (accessTokenUsed !== this.accessToken) {
        return this.send<TData>(path, options, false);
      }

      await this.refreshAccessToken();
      return this.send<TData>(path, options, false);
    }

    const body = await readJson(response);

    if (!response.ok) {
      if (response.status === 401 && authenticated) {
        this.clearAuthentication();
      }

      if (isStandardApiError(body)) {
        throw new ApiError(
          body.error.code,
          body.error.message,
          response.status,
          body.error.details,
        );
      }

      throw new ApiError(
        "UNEXPECTED_API_FAILURE",
        "The Sunshine ERP API request failed unexpectedly.",
        response.status,
      );
    }

    if (!isApiSuccess<TData>(body)) {
      throw new ApiError(
        "UNEXPECTED_API_RESPONSE",
        "The Sunshine ERP API returned an unexpected response.",
        response.status,
      );
    }

    return body.data;
  }
}
