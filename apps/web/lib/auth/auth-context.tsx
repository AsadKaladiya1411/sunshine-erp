"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AuthenticationApiClient,
} from "../api/auth-api-client";
import type {
  AuthenticatedUserIdentity,
  AuthenticationStatus,
  LoginRequest,
} from "./auth.types";

interface AuthContextValue {
  readonly status: AuthenticationStatus;
  readonly user: AuthenticatedUserIdentity | null;
  readonly login: (input: LoginRequest) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly restoreSession: () => Promise<void>;
  readonly request: <TData>(
    path: string,
    options?: RequestInit,
  ) => Promise<TData>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
  client: suppliedClient,
}: {
  readonly children: ReactNode;
  readonly client?: AuthenticationApiClient;
}) {
  const [client] = useState(
    () => suppliedClient ?? new AuthenticationApiClient(),
  );
  const [status, setStatus] = useState<AuthenticationStatus>("loading");
  const [user, setUser] = useState<AuthenticatedUserIdentity | null>(null);

  const clearAuthentication = useCallback(() => {
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const establishSession = useCallback(
    (identity: AuthenticatedUserIdentity) => {
      setUser(identity);
      setStatus("authenticated");
    },
    [],
  );

  const restoreSession = useCallback(async () => {
    setStatus("loading");

    try {
      establishSession(await client.restoreSession());
    } catch {
      clearAuthentication();
    }
  }, [clearAuthentication, client, establishSession]);

  useEffect(() => {
    let active = true;
    client.setAuthenticationLostHandler(() => {
      if (active) {
        clearAuthentication();
      }
    });

    void client
      .restoreSession()
      .then((identity) => {
        if (active) {
          establishSession(identity);
        }
      })
      .catch(() => {
        if (active) {
          clearAuthentication();
        }
      });

    return () => {
      active = false;
      client.setAuthenticationLostHandler(null);
    };
  }, [clearAuthentication, client, establishSession]);

  const login = useCallback(
    async (input: LoginRequest) => {
      establishSession(await client.login(input));
    },
    [client, establishSession],
  );

  const logout = useCallback(async () => {
    setStatus("loading");

    try {
      await client.logout();
    } finally {
      clearAuthentication();
    }
  }, [clearAuthentication, client]);

  const request = useCallback(
    <TData,>(path: string, options?: RequestInit) =>
      client.request<TData>(path, { ...options, authenticated: true }),
    [client],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout, restoreSession, request }),
    [login, logout, request, restoreSession, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
