"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "../../lib/api/auth-api-client";
import type {
  AuthenticationStatus,
  LoginRequest,
} from "../../lib/auth/auth.types";
import styles from "./authentication.module.css";

type IdentifierType = "username" | "email";

interface LoginFormProps {
  readonly authenticationStatus: AuthenticationStatus;
  readonly onLogin: (input: LoginRequest) => Promise<void>;
  readonly onAuthenticated: () => void;
}

interface FormError {
  readonly code: string;
  readonly message: string;
}

function utf8Length(value: string): number {
  return new Blob([value]).size;
}

function validateLoginInput(
  organizationCode: string,
  identifierType: IdentifierType,
  identifier: string,
  password: string,
): FormError | null {
  if (!organizationCode.trim()) {
    return {
      code: "FORM_VALIDATION",
      message: "Organization Code is required.",
    };
  }

  if (!identifier.trim()) {
    return {
      code: "FORM_VALIDATION",
      message: `${identifierType === "username" ? "Username" : "Email"} is required.`,
    };
  }

  if (
    identifierType === "email" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim())
  ) {
    return {
      code: "FORM_VALIDATION",
      message: "Enter a valid email address.",
    };
  }

  if (!password) {
    return { code: "FORM_VALIDATION", message: "Password is required." };
  }

  if (utf8Length(password) > 72) {
    return {
      code: "FORM_VALIDATION",
      message: "Password must not exceed 72 UTF-8 bytes.",
    };
  }

  return null;
}

function presentLoginError(error: unknown): FormError {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.message };
  }

  return {
    code: "UNEXPECTED_LOGIN_ERROR",
    message: "Sign in could not be completed. Please try again.",
  };
}

export function LoginForm({
  authenticationStatus,
  onLogin,
  onAuthenticated,
}: LoginFormProps) {
  const [organizationCode, setOrganizationCode] = useState("");
  const [identifierType, setIdentifierType] =
    useState<IdentifierType>("username");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const validationError = validateLoginInput(
      organizationCode,
      identifierType,
      identifier,
      password,
    );

    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);

    const normalizedIdentifier = identifier.trim();
    const input: LoginRequest =
      identifierType === "username"
        ? {
            organizationCode: organizationCode.trim(),
            username: normalizedIdentifier,
            password,
          }
        : {
            organizationCode: organizationCode.trim(),
            email: normalizedIdentifier,
            password,
          };

    try {
      await onLogin(input);
      onAuthenticated();
    } catch (loginError: unknown) {
      setError(presentLoginError(loginError));
    } finally {
      setSubmitting(false);
    }
  }

  const restoring = authenticationStatus === "loading";
  const disabled = restoring || submitting;

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.field}>
        <label htmlFor="organization-code">Organization Code</label>
        <input
          id="organization-code"
          name="organizationCode"
          autoComplete="organization"
          maxLength={50}
          value={organizationCode}
          onChange={(event) => setOrganizationCode(event.target.value)}
          disabled={disabled}
        />
      </div>

      <fieldset className={styles.identifierChoice} disabled={disabled}>
        <legend>Sign in with</legend>
        <label>
          <input
            type="radio"
            name="identifierType"
            value="username"
            checked={identifierType === "username"}
            onChange={() => {
              setIdentifierType("username");
              setIdentifier("");
            }}
          />
          Username
        </label>
        <label>
          <input
            type="radio"
            name="identifierType"
            value="email"
            checked={identifierType === "email"}
            onChange={() => {
              setIdentifierType("email");
              setIdentifier("");
            }}
          />
          Email
        </label>
      </fieldset>

      <div className={styles.field}>
        <label htmlFor="login-identifier">
          {identifierType === "username" ? "Username" : "Email"}
        </label>
        <input
          id="login-identifier"
          name={identifierType}
          type={identifierType === "email" ? "email" : "text"}
          autoComplete={identifierType}
          maxLength={150}
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          disabled={disabled}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={disabled}
        />
      </div>

      {error ? (
        <div
          className={styles.error}
          role="alert"
          data-error-code={error.code}
        >
          {error.message}
        </div>
      ) : null}

      <button className={styles.primaryButton} type="submit" disabled={disabled}>
        {restoring
          ? "Checking session…"
          : submitting
            ? "Signing in…"
            : "Sign in"}
      </button>
    </form>
  );
}
