"use client";

import { useEffect, useState } from "react";
import { ApiError } from "../../lib/api/auth-api-client";
import type {
  AuthenticatedUserIdentity,
  AuthenticationStatus,
} from "../../lib/auth/auth.types";
import styles from "./authentication.module.css";

export function ProtectedApplication({
  status,
  user,
  onLogout,
  onUnauthenticated,
}: {
  readonly status: AuthenticationStatus;
  readonly user: AuthenticatedUserIdentity | null;
  readonly onLogout: () => Promise<void>;
  readonly onUnauthenticated: () => void;
}) {
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      onUnauthenticated();
    }
  }, [onUnauthenticated, status]);

  if (status !== "authenticated" || !user) {
    return (
      <main className={styles.statusPage} aria-live="polite">
        <div className={styles.spinner} aria-hidden="true" />
        <p>
          {status === "loading"
            ? "Restoring your secure session…"
            : "Opening sign in…"}
        </p>
      </main>
    );
  }

  async function handleLogout() {
    setLogoutError(null);
    try {
      await onLogout();
    } catch (error: unknown) {
      setLogoutError(
        error instanceof ApiError
          ? error.message
          : "The server logout could not be confirmed.",
      );
    }
  }

  return (
    <main className={styles.applicationPage}>
      <section className={styles.applicationCard}>
        <div>
          <p className={styles.eyebrow}>NO CHEAT® ERP</p>
          <h1>Authentication confirmed</h1>
          <p className={styles.muted}>
            The ERP application workspace will be introduced in a later slice.
          </p>
        </div>

        <dl className={styles.identityGrid}>
          <div>
            <dt>User</dt>
            <dd>
              {user.firstName}
              {user.lastName ? ` ${user.lastName}` : ""}
            </dd>
          </div>
          <div>
            <dt>Organization</dt>
            <dd>{user.organizationName}</dd>
          </div>
          <div>
            <dt>Department</dt>
            <dd>{user.departmentName}</dd>
          </div>
        </dl>

        {logoutError ? <p role="alert">{logoutError}</p> : null}

        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => void handleLogout()}
        >
          Sign out
        </button>
      </section>
    </main>
  );
}
