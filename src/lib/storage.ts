import "server-only";
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { Readable } from "node:stream";
import { env } from "@/lib/env";

/**
 * Almacenamiento de archivos en MinIO (compatible con S3), solo por la red interna de Easypanel.
 * El navegador nunca habla con MinIO directo: las subidas y descargas pasan por la app,
 * que valida la sesión. Así el bucket queda privado y sin dominio público.
 */

export function storageConfigured(): boolean {
  const e = env();
  return Boolean(e.S3_ENDPOINT && e.S3_BUCKET && e.S3_ACCESS_KEY && e.S3_SECRET_KEY);
}

let client: S3Client | null = null;
function s3(): S3Client {
  const e = env();
  if (!storageConfigured()) throw new Error("Almacenamiento no configurado (S3_*).");
  client ??= new S3Client({
    endpoint: e.S3_ENDPOINT,
    region: e.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: e.S3_ACCESS_KEY!, secretAccessKey: e.S3_SECRET_KEY! },
  });
  return client;
}

const bucket = () => env().S3_BUCKET!;

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  try {
    await s3().send(new HeadBucketCommand({ Bucket: bucket() }));
  } catch {
    await s3().send(new CreateBucketCommand({ Bucket: bucket() }));
  }
  bucketReady = true;
}

/** Sube en partes (multipart) sin cargar el archivo completo en memoria. */
export async function putObjectStream(key: string, body: Readable, contentType: string): Promise<void> {
  await ensureBucket();
  await new Upload({
    client: s3(),
    params: { Bucket: bucket(), Key: key, Body: body, ContentType: contentType },
    queueSize: 3,
    partSize: 8 * 1024 * 1024,
  }).done();
}

export type ObjectRead = {
  body: ReadableStream;
  contentType: string;
  contentLength: number | undefined;
  contentRange: string | undefined;
  partial: boolean;
};

export async function getObject(key: string, range?: string): Promise<ObjectRead | null> {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: range }));
    if (!res.Body) return null;
    return {
      body: res.Body.transformToWebStream(),
      contentType: res.ContentType ?? "application/octet-stream",
      contentLength: res.ContentLength,
      contentRange: res.ContentRange,
      partial: Boolean(res.ContentRange),
    };
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "NoSuchKey" || name === "NotFound" || name === "InvalidRange") return null;
    throw err;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
