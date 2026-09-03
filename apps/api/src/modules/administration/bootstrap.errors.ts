export class BootstrapValidationError extends Error {
  constructor(message = "Bootstrap input is invalid.") {
    super(message);
    this.name = "BootstrapValidationError";
  }
}

export class BootstrapNotAllowedError extends Error {
  constructor() {
    super(
      "Bootstrap is allowed only for an empty, uninitialized administration and security state.",
    );
    this.name = "BootstrapNotAllowedError";
  }
}

export class BootstrapSecretInputError extends Error {
  constructor(message = "A password must be supplied through secure input.") {
    super(message);
    this.name = "BootstrapSecretInputError";
  }
}
