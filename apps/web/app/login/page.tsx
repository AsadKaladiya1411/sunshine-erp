"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoginForm } from "../../components/auth/login-form";
import styles from "../../components/auth/authentication.module.css";
import { useAuth } from "../../lib/auth/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { status, login } = useAuth();
  const openApplication = useCallback(() => {
    router.replace("/");
  }, [router]);

  useEffect(() => {
    if (status === "authenticated") {
      openApplication();
    }
  }, [openApplication, status]);

  return (
    <main className={styles.loginPage}>
      <section className={styles.loginCard} aria-labelledby="login-title">
        <header className={styles.loginHeader}>
          <div>
            <p className={styles.eyebrow}>NO CHEAT® ERP</p>
            <h1 id="login-title">Sign in to Sunshine ERP</h1>
            <p className={styles.muted}>
              Use your organization and account credentials.
            </p>
          </div>
        </header>

        <LoginForm
          authenticationStatus={status}
          onLogin={login}
          onAuthenticated={openApplication}
        />
      </section>
    </main>
  );
}
