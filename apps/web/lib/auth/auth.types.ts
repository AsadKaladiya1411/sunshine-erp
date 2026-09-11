export interface AuthenticatedUserIdentity {
  readonly userId: string;
  readonly organizationId: string;
  readonly organizationCode: string;
  readonly organizationName: string;
  readonly departmentId: string;
  readonly departmentCode: string;
  readonly departmentName: string;
  readonly sessionId: string;
  readonly username: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string | null;
}

interface LoginRequestBase {
  readonly organizationCode: string;
  readonly password: string;
}

export type LoginRequest = LoginRequestBase &
  (
    | {
        readonly username: string;
        readonly email?: never;
      }
    | {
        readonly email: string;
        readonly username?: never;
      }
  );

export type AuthenticationStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated";
