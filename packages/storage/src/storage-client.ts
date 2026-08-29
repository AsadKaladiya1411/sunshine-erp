import { PassThrough, Readable } from "node:stream";
import { MinioStorageTransport } from "./minio-storage-transport.js";
import { validateStorageObjectKey } from "./object-key.js";
import {
  StorageConfigurationError,
  StorageDeleteError,
  StorageDisabledError,
  StorageDownloadError,
  StorageHeadError,
  StorageUnavailableError,
  StorageUploadError,
} from "./storage.errors.js";
import type {
  ObjectStorageClient,
  PutObjectInput,
  ResolvedStorageConfiguration,
  StorageClientConfiguration,
  StorageObjectMetadata,
  StorageOperationalLogger,
  StorageTransport,
  StorageTransportFactory,
} from "./storage.types.js";

const silentStorageLogger: StorageOperationalLogger = {
  info: () => undefined,
  warn: () => undefined,
};

function safeErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (typeof error.code === "string" || typeof error.code === "number")
  ) {
    return String(error.code);
  }
  return "UNKNOWN";
}

function isMissingObjectError(error: unknown): boolean {
  const code = safeErrorCode(error);
  return code === "NoSuchKey" || code === "NotFound" || code === "NoSuchObject";
}

function assertUploadInput(input: PutObjectInput): void {
  if (input.body instanceof Readable) {
    if (!Number.isSafeInteger(input.size) || (input.size ?? 0) < 0) {
      throw new StorageUploadError();
    }
  } else if (input.size !== undefined && input.size !== input.body.byteLength) {
    throw new StorageUploadError();
  }

  if (
    input.contentType !== undefined &&
    !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(input.contentType)
  ) {
    throw new StorageUploadError();
  }
}

function isAvailabilityError(
  error: unknown,
): error is StorageDisabledError | StorageUnavailableError {
  return (
    error instanceof StorageDisabledError ||
    error instanceof StorageUnavailableError
  );
}

export class ObjectStorageInfrastructureClient implements ObjectStorageClient {
  private transport: StorageTransport | undefined;
  private connectedState = false;

  constructor(
    private readonly configuration: StorageClientConfiguration,
    private readonly transportFactory: StorageTransportFactory = (
      resolvedConfiguration,
    ) => new MinioStorageTransport(resolvedConfiguration),
    private readonly operationalLogger: StorageOperationalLogger = silentStorageLogger,
  ) {}

  get enabled(): boolean {
    return this.configuration.enabled;
  }

  get connected(): boolean {
    return this.connectedState;
  }

  async connect(): Promise<boolean> {
    if (!this.enabled) {
      this.operationalLogger.info(
        { component: "object-storage" },
        "Object storage is disabled",
      );
      return false;
    }
    if (this.connected) {
      return true;
    }

    let transport: StorageTransport | undefined;
    try {
      const configuration = this.resolvedConfiguration();
      transport = this.transportFactory(configuration);
      this.transport = transport;
      if (!(await transport.bucketExists(configuration.bucket))) {
        await transport.makeBucket(configuration.bucket, configuration.region);
      }
      this.connectedState = true;
      this.operationalLogger.info(
        { component: "object-storage" },
        "Object storage connected",
      );
      return true;
    } catch {
      this.transport = undefined;
      this.connectedState = false;
      await transport?.close().catch(() => undefined);
      this.operationalLogger.warn(
        {
          component: "object-storage",
          errorCode: "STORAGE_CONNECTION_FAILED",
        },
        "Object storage unavailable; continuing without binary storage infrastructure",
      );
      return false;
    }
  }

  async disconnect(): Promise<void> {
    const transport = this.transport;
    this.transport = undefined;
    this.connectedState = false;
    if (!transport) {
      return;
    }

    try {
      await transport.close();
      this.operationalLogger.info(
        { component: "object-storage" },
        "Object storage disconnected",
      );
    } catch {
      this.operationalLogger.warn(
        {
          component: "object-storage",
          errorCode: "STORAGE_DISCONNECT_FAILED",
        },
        "Object storage disconnect failed",
      );
    }
  }

  async ping(): Promise<boolean> {
    if (!this.connected || !this.transport) {
      return false;
    }
    try {
      return await this.transport.bucketExists(this.bucket());
    } catch {
      return false;
    }
  }

  async putObject(input: PutObjectInput): Promise<void> {
    const key = validateStorageObjectKey(String(input.key));
    assertUploadInput(input);
    try {
      await this.readyTransport().putObject(
        this.bucket(),
        key,
        input.body,
        input.size,
        input.contentType,
      );
    } catch (error: unknown) {
      if (isAvailabilityError(error)) throw error;
      throw new StorageUploadError();
    }
  }

  async getObject(keyValue: string): Promise<Readable> {
    const key = validateStorageObjectKey(keyValue);
    let source: Readable;
    try {
      source = await this.readyTransport().getObject(this.bucket(), key);
    } catch (error: unknown) {
      if (isAvailabilityError(error)) throw error;
      throw new StorageDownloadError();
    }

    const safeStream = new PassThrough();
    source.once("error", () => safeStream.destroy(new StorageDownloadError()));
    source.pipe(safeStream);
    return safeStream;
  }

  async headObject(keyValue: string): Promise<StorageObjectMetadata> {
    const key = validateStorageObjectKey(keyValue);
    try {
      return await this.readyTransport().statObject(this.bucket(), key);
    } catch (error: unknown) {
      if (isAvailabilityError(error)) throw error;
      throw new StorageHeadError();
    }
  }

  async objectExists(keyValue: string): Promise<boolean> {
    const key = validateStorageObjectKey(keyValue);
    try {
      await this.readyTransport().statObject(this.bucket(), key);
      return true;
    } catch (error: unknown) {
      if (isMissingObjectError(error)) return false;
      if (isAvailabilityError(error)) throw error;
      throw new StorageHeadError();
    }
  }

  async deleteObject(keyValue: string): Promise<void> {
    const key = validateStorageObjectKey(keyValue);
    try {
      await this.readyTransport().removeObject(this.bucket(), key);
    } catch (error: unknown) {
      if (isAvailabilityError(error)) throw error;
      throw new StorageDeleteError();
    }
  }

  private resolvedConfiguration(): ResolvedStorageConfiguration {
    const { endpoint, accessKey, secretKey, bucket, region } =
      this.configuration;
    if (!endpoint || !accessKey || !secretKey || !bucket || !region) {
      throw new StorageConfigurationError();
    }
    return { endpoint, accessKey, secretKey, bucket, region };
  }

  private bucket(): string {
    return this.resolvedConfiguration().bucket;
  }

  private readyTransport(): StorageTransport {
    if (!this.enabled) throw new StorageDisabledError();
    if (!this.connected || !this.transport) throw new StorageUnavailableError();
    return this.transport;
  }
}
