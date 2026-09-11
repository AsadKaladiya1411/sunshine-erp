"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ProtectedApplication } from "../components/auth/protected-application";
import { useAuth } from "../lib/auth/auth-context";

export default function Home() {
  const router = useRouter();
  const { status, user, logout } = useAuth();
  const openLogin = useCallback(() => {
    router.replace("/login");
  }, [router]);

  return (
    <ProtectedApplication
      status={status}
      user={user}
      onLogout={logout}
      onUnauthenticated={openLogin}
    />
  );
}
