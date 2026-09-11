import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  ApiError,
  AuthenticationApiClient,
  type WebFetch,
} from "../../lib/api/auth-api-client";
import { AuthProvider, useAuth } from "../../lib/auth/auth-context";
import type { AuthenticatedUserIdentity } from "../../lib/auth/auth.types";
import { LoginForm } from "./login-form";
import { ProtectedApplication } from "./protected-application";

const identity: AuthenticatedUserIdentity = {
  userId: "9c223137-04a0-49dc-8844-ebfd819d8c5d",
  organizationId: "c5906f64-4f9d-41a4-b0dd-18c40e46ff90",
  organizationCode: "SUNSHINE",
  organizationName: "Sunshine Corporation",
  departmentId: "74082d3a-432c-4919-8d98-8d325b20cf63",
  departmentCode: "ADMIN",
  departmentName: "Administration",
  sessionId: "fa75d7d9-6a9f-498a-a731-8f58e489a33c",
  username: "admin",
  email: "admin@example.com",
  firstName: "First",
  lastName: "Administrator",
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: jest.fn(async () => body),
  } as unknown as Response;
}

function fillUsernameLoginForm(): void {
  fireEvent.change(screen.getByLabelText("Organization Code"), {
    target: { value: "SUNSHINE" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Username" }), {
    target: { value: "admin" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "valid-password" },
  });
}

describe("LoginForm", () => {
  it("renders the approved fields and validates the selected identifier", async () => {
    const onLogin = jest.fn<() => Promise<void>>();
    render(
      <LoginForm
        authenticationStatus="unauthenticated"
        onLogin={onLogin}
        onAuthenticated={jest.fn()}
      />,
    );

    expect(screen.getByLabelText("Organization Code")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Username" })).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Organization Code is required.",
    );
    expect(onLogin).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Email"));
    fireEvent.change(screen.getByLabelText("Organization Code"), {
      target: { value: "SUNSHINE" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
      target: { value: "not-an-email" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "valid-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Enter a valid email address.",
    );
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("submits once, prevents a duplicate submission, and reports success", async () => {
    let completeLogin: (() => void) | undefined;
    const loginPending = new Promise<void>((resolve) => {
      completeLogin = resolve;
    });
    const onLogin = jest.fn(() => loginPending);
    const onAuthenticated = jest.fn();
    render(
      <LoginForm
        authenticationStatus="unauthenticated"
        onLogin={onLogin}
        onAuthenticated={onAuthenticated}
      />,
    );
    fillUsernameLoginForm();

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(
      (
        screen.getByRole("button", {
          name: "Signing in…",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Signing in…" }));
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onLogin).toHaveBeenCalledWith({
      organizationCode: "SUNSHINE",
      username: "admin",
      password: "valid-password",
    });

    completeLogin?.();
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
  });

  it.each([
    ["INVALID_CREDENTIALS", "Invalid organization or credentials."],
    [
      "SESSION_LIMIT_REACHED",
      "The maximum number of active sessions is reached.",
    ],
    ["RATE_LIMIT_EXCEEDED", "Too many requests. Please try again later."],
    ["NETWORK_ERROR", "Unable to connect to the Sunshine ERP API."],
  ])("shows the distinct %s failure", async (code, message) => {
    const onLogin = jest.fn(async () => {
      throw new ApiError(code, message, null);
    });
    render(
      <LoginForm
        authenticationStatus="unauthenticated"
        onLogin={onLogin}
        onAuthenticated={jest.fn()}
      />,
    );
    fillUsernameLoginForm();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(message);
    expect(alert.getAttribute("data-error-code")).toBe(code);
  });
});

function AuthStateProbe() {
  const { status, user } = useAuth();
  return <p>{`${status}:${user?.username ?? "none"}`}</p>;
}

describe("AuthProvider", () => {
  it("starts in loading state and restores identity through refresh plus /me", async () => {
    let releaseRefresh: ((response: Response) => void) | undefined;
    const refreshPending = new Promise<Response>((resolve) => {
      releaseRefresh = resolve;
    });
    const fetchMock = jest
      .fn<WebFetch>()
      .mockReturnValueOnce(refreshPending)
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: identity }),
      );
    const client = new AuthenticationApiClient(
      "http://localhost:4000",
      fetchMock,
      () => "provider-correlation-id",
    );

    render(
      <AuthProvider client={client}>
        <AuthStateProbe />
      </AuthProvider>,
    );
    expect(screen.getByText("loading:none")).toBeTruthy();

    releaseRefresh?.(
      jsonResponse(200, {
        success: true,
        data: {
          accessToken: "restored-token",
          tokenType: "Bearer",
          expiresIn: 900,
        },
      }),
    );

    expect(await screen.findByText("authenticated:admin")).toBeTruthy();
  });

  it("settles as unauthenticated when one startup restoration attempt fails", async () => {
    const fetchMock = jest.fn<WebFetch>().mockResolvedValueOnce(
      jsonResponse(401, {
        success: false,
        error: {
          code: "INVALID_REFRESH_TOKEN",
          message: "Refresh token is invalid or expired.",
        },
      }),
    );
    const client = new AuthenticationApiClient(
      "http://localhost:4000",
      fetchMock,
      () => "failed-restore-correlation-id",
    );

    render(
      <AuthProvider client={client}>
        <AuthStateProbe />
      </AuthProvider>,
    );

    expect(await screen.findByText("unauthenticated:none")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("ProtectedApplication", () => {
  it("shows loading, redirects unauthenticated state, and renders only authenticated identity", async () => {
    const onUnauthenticated = jest.fn();
    const onLogout = jest.fn(async () => undefined);
    const { rerender } = render(
      <ProtectedApplication
        status="loading"
        user={null}
        onLogout={onLogout}
        onUnauthenticated={onUnauthenticated}
      />,
    );
    expect(screen.getByText("Restoring your secure session…")).toBeTruthy();

    rerender(
      <ProtectedApplication
        status="unauthenticated"
        user={null}
        onLogout={onLogout}
        onUnauthenticated={onUnauthenticated}
      />,
    );
    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalledTimes(1));

    rerender(
      <ProtectedApplication
        status="authenticated"
        user={identity}
        onLogout={onLogout}
        onUnauthenticated={onUnauthenticated}
      />,
    );
    expect(screen.getByText("Authentication confirmed")).toBeTruthy();
    expect(screen.getByText("Sunshine Corporation")).toBeTruthy();
    expect(screen.getByText("Administration")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
  });
});
