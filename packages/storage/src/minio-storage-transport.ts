import type { Readable } from "node:stream";
import { Client } from "minio";
import type {
  ResolvedStorageConfiguration,
  StorageObjectMetadata,
  StorageTransport,
} from "./storage.types.js";

function metadataContentType(
  metadata: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  const value = metadata?.["content-type"] ?? metadata?.["Content-Type"];
  return typeof value === "string" ? value : undefined;
}

export class MinioStorageTransport implements StorageTransport {
  private readonly client: Client;

  constructor(configuration: ResolvedStorageConfiguration) {
    const endpoint = new URL(configuration.endpoint);
    this.client = new Client({
      endPoint: endpoint.hostname,
      port:
        endpoint.port.length > 0
          ? Number(endpoint.port)
          : endpoint.protocol === "https:"
            ? 443
            : 80,
      useSSL: endpoint.protocol === "https:",
      accessKey: configuration.accessKey,
      secretKey: configuration.secretKey,
      region: configuration.region,
    });
  }

  bucketExists(bucket: string): Promise<boolean> {
    return this.client.bucketExists(bucket);
  }

  async makeBucket(bucket: string, region: string): Promise<void> {
    await this.client.makeBucket(bucket, region);
  }

  async putObject(
    bucket: string,
    key: string,
    body: Buffer | Readable,
    size: number | undefined,
    contentType: string | undefined,
  ): Promise<void> {
    await this.client.putObject(
      bucket,
      key,
      body,
      size,
      contentType ? { "Content-Type": contentType } : undefined,
    );
  }

  getObject(bucket: string, key: string): Promise<Readable> {
    return this.client.getObject(bucket, key);
  }

  async statObject(
    bucket: string,
    key: string,
  ): Promise<StorageObjectMetadata> {
    const stat = await this.client.statObject(bucket, key);
    return Object.freeze({
      size: stat.size,
      etag: stat.etag,
      lastModified: stat.lastModified,
      contentType: metadataContentType(stat.metaData),
    });
  }

  async removeObject(bucket: string, key: string): Promise<void> {
    await this.client.removeObject(bucket, key);
  }

  async close(): Promise<void> {
    // The MinIO SDK does not expose a persistent client shutdown method.
  }
}
