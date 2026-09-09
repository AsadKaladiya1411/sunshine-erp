import { Readable } from "node:stream";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type BucketLocationConstraint,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import type {
  ResolvedStorageConfiguration,
  StorageObjectMetadata,
  StorageTransport,
} from "./storage.types.js";

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const name = "name" in error ? error.name : undefined;
  if (name === "NotFound" || name === "NoSuchBucket") return true;

  if (!("$metadata" in error)) return false;
  const metadata = error.$metadata;
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    "httpStatusCode" in metadata &&
    metadata.httpStatusCode === 404
  );
}

class MissingStorageObjectError extends Error {
  readonly code = "NoSuchKey";

  constructor() {
    super("Object not found");
    this.name = "MissingStorageObjectError";
  }
}

function normalizeEtag(etag: string | undefined): string | undefined {
  if (!etag) return undefined;
  return etag.startsWith('"') && etag.endsWith('"')
    ? etag.slice(1, -1)
    : etag;
}

export class MinioStorageTransport implements StorageTransport {
  private readonly client: S3Client;

  constructor(configuration: ResolvedStorageConfiguration) {
    this.client = new S3Client({
      endpoint: configuration.endpoint,
      region: configuration.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: configuration.accessKey,
        secretAccessKey: configuration.secretKey,
      },
    });
  }

  async bucketExists(bucket: string): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch (error: unknown) {
      if (isNotFoundError(error)) return false;
      throw error;
    }
  }

  async makeBucket(bucket: string, region: string): Promise<void> {
    await this.client.send(
      new CreateBucketCommand({
        Bucket: bucket,
        ...(region === "us-east-1"
          ? {}
          : {
              CreateBucketConfiguration: {
                LocationConstraint: region as BucketLocationConstraint,
              },
            }),
      }),
    );
  }

  async putObject(
    bucket: string,
    key: string,
    body: Buffer | Readable,
    size: number | undefined,
    contentType: string | undefined,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentLength: size,
        ContentType: contentType,
      }),
    );
  }

  async getObject(bucket: string, key: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!(response.Body instanceof Readable)) {
      throw new Error("Object storage returned a non-Node.js response body");
    }
    return response.Body;
  }

  async statObject(
    bucket: string,
    key: string,
  ): Promise<StorageObjectMetadata> {
    let stat: HeadObjectCommandOutput;
    try {
      stat = await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
    } catch (error: unknown) {
      if (isNotFoundError(error)) throw new MissingStorageObjectError();
      throw error;
    }
    return Object.freeze({
      size: stat.ContentLength ?? 0,
      etag: normalizeEtag(stat.ETag),
      lastModified: stat.LastModified,
      contentType: stat.ContentType,
    });
  }

  async removeObject(bucket: string, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  }

  async close(): Promise<void> {
    this.client.destroy();
  }
}
