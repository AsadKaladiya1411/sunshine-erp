import type { Readable } from "node:stream";
import type { StorageObjectKey } from "./object-key.js";

export interface StorageClientConfiguration {
  readonly enabled: boolean;
  readonly endpoint?: string;
  readonly accessKey?: string;
  readonly secretKey?: string;
  readonly bucket?: string;
  readonly region: string;
}

export interface PutObjectInput {
  readonly key: string | StorageObjectKey;
  readonly body: Buffer | Readable;
  readonly size?: number;
  readonly contentType?: string;
}

export interface StorageObjectMetadata {
  readonly size: number;
  readonly etag?: string;
  readonly lastModified?: Date;
  readonly contentType?: string;
}

export interface ObjectStorageClient {
  readonly enabled: boolean;
  readonly connected: boolean;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;
  putObject(input: PutObjectInput): Promise<void>;
  getObject(key: string | StorageObjectKey): Promise<Readable>;
  headObject(key: string | StorageObjectKey): Promise<StorageObjectMetadata>;
  objectExists(key: string | StorageObjectKey): Promise<boolean>;
  deleteObject(key: string | StorageObjectKey): Promise<void>;
}

export interface StorageOperationalLogger {
  info(bindings: Readonly<Record<string, unknown>>, message: string): void;
  warn(bindings: Readonly<Record<string, unknown>>, message: string): void;
}

export interface StorageTransport {
  bucketExists(bucket: string): Promise<boolean>;
  makeBucket(bucket: string, region: string): Promise<void>;
  putObject(
    bucket: string,
    key: string,
    body: Buffer | Readable,
    size: number | undefined,
    contentType: string | undefined,
  ): Promise<void>;
  getObject(bucket: string, key: string): Promise<Readable>;
  statObject(bucket: string, key: string): Promise<StorageObjectMetadata>;
  removeObject(bucket: string, key: string): Promise<void>;
  close(): Promise<void>;
}

export interface ResolvedStorageConfiguration {
  readonly endpoint: string;
  readonly accessKey: string;
  readonly secretKey: string;
  readonly bucket: string;
  readonly region: string;
}

export type StorageTransportFactory = (
  configuration: ResolvedStorageConfiguration,
) => StorageTransport;
