export type StorageInfrastructureErrorCode =
  | "STORAGE_CONFIGURATION_INVALID"
  | "STORAGE_DISABLED"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_KEY_INVALID"
  | "STORAGE_UPLOAD_FAILED"
  | "STORAGE_DOWNLOAD_FAILED"
  | "STORAGE_HEAD_FAILED"
  | "STORAGE_DELETE_FAILED";

export class StorageInfrastructureError extends Error {
  constructor(
    public readonly code: StorageInfrastructureErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StorageInfrastructureError";
  }
}

export class StorageConfigurationError extends StorageInfrastructureError {
  constructor() {
    super(
      "STORAGE_CONFIGURATION_INVALID",
      "Object storage configuration is invalid.",
    );
  }
}

export class StorageDisabledError extends StorageInfrastructureError {
  constructor() {
    super("STORAGE_DISABLED", "Object storage infrastructure is disabled.");
  }
}

export class StorageUnavailableError extends StorageInfrastructureError {
  constructor() {
    super(
      "STORAGE_UNAVAILABLE",
      "Object storage infrastructure is unavailable.",
    );
  }
}

export class StorageKeyInvalidError extends StorageInfrastructureError {
  constructor() {
    super("STORAGE_KEY_INVALID", "Object storage key is invalid.");
  }
}

export class StorageUploadError extends StorageInfrastructureError {
  constructor() {
    super("STORAGE_UPLOAD_FAILED", "Object upload failed.");
  }
}

export class StorageDownloadError extends StorageInfrastructureError {
  constructor() {
    super("STORAGE_DOWNLOAD_FAILED", "Object download failed.");
  }
}

export class StorageHeadError extends StorageInfrastructureError {
  constructor() {
    super("STORAGE_HEAD_FAILED", "Object metadata lookup failed.");
  }
}

export class StorageDeleteError extends StorageInfrastructureError {
  constructor() {
    super("STORAGE_DELETE_FAILED", "Object deletion failed.");
  }
}
