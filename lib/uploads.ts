import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { readApiError } from './api-error';
import { API_BASE_URL } from './transactions';

const uploadFieldLabels: Record<string, string> = {
  file: 'Receipt',
};

// The backend sniffs the actual bytes and ignores whatever type we declare, so
// this map only needs to be good enough to tell an image from a PDF when the
// filesystem cannot tell us the type itself.
const mimeByExtension: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heic',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

export const ATTACHMENT_PICKER_TYPES = ['image/*', 'application/pdf'];

/**
 * A phone camera writes 3–5 MB JPEGs, and a photographed bill is legible long
 * before that. Every one of those megabytes is paid for twice — once on the
 * user's data plan and once on the upload volume — so images are re-encoded
 * down before they leave the device.
 *
 * 1600px on the long edge keeps a full-page bill readable (a line of receipt
 * print is still ~20px tall) and lands a typical photo around 200-400 KB.
 * PDFs pass through untouched: they are documents, not photographs.
 */
const MAX_IMAGE_EDGE = 1600;
const IMAGE_QUALITY = 0.7;

/**
 * Below this an image is already small enough that a re-encode costs quality
 * and saves nothing worth having — a cropped screenshot, an emailed receipt.
 */
const COMPRESS_ABOVE_BYTES = 400 * 1024;

/**
 * A picked-but-not-yet-uploaded file still points at local device storage.
 * Anything else is already a URL the backend gave us.
 */
export const isLocalAttachmentUri = (value: string | null | undefined): boolean =>
  !!value && (value.startsWith('file://') || value.startsWith('content://'));

export const isPdfAttachment = (value: string | null | undefined): boolean =>
  !!value && value.split('?')[0].toLowerCase().endsWith('.pdf');

const finnriUploadName = (value: string): string | null => {
  try {
    const parsed = new URL(value, API_BASE_URL);
    if (parsed.origin !== new URL(API_BASE_URL).origin) return null;
    const match = parsed.pathname.match(/^\/uploads\/([^/]+)$/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
};

/** Exchanges a stable stored path for a five-minute owner-session URL. */
export const resolveAttachmentForDisplay = async (
  token: string,
  attachment: string
): Promise<string> => {
  const name = finnriUploadName(attachment);
  if (!name) return attachment;

  const response = await fetch(`${API_BASE_URL}/v1/uploads/${encodeURIComponent(name)}/url`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to open that receipt right now.');
  }
  const data = (await response.json()) as { url?: string };
  if (!data.url) throw new Error('Unable to open that receipt right now.');
  return data.url;
};

const attachmentFileName = (uri: string): string => {
  const fromPath = uri.split('?')[0].split('/').pop();
  return fromPath && fromPath.length > 0 ? decodeURIComponent(fromPath) : 'receipt';
};

/**
 * `File.type` is resolved natively (by content resolver on Android), so it is
 * the best answer when we have one. The picker's declared type and then the
 * extension stand in when the file cannot be inspected.
 */
const attachmentMimeType = (file: File, uri: string, declared?: string | null): string => {
  if (file.type) {
    return file.type;
  }
  if (declared && declared.includes('/')) {
    return declared;
  }
  const extension = attachmentFileName(uri).split('.').pop()?.toLowerCase() ?? '';
  return mimeByExtension[extension] ?? 'application/octet-stream';
};

/**
 * Downscales to `MAX_IMAGE_EDGE` on the long edge and re-encodes as JPEG.
 * Resolves to a new file in the cache directory — the original is untouched,
 * which matters because on Android it may be the user's own gallery item.
 */
const compressImage = async (uri: string): Promise<File> => {
  const decoded = await ImageManipulator.manipulate(uri).renderAsync();
  const longestEdge = Math.max(decoded.width, decoded.height);
  // `resize` with a single dimension preserves the ratio, so the constrained
  // edge has to be whichever one is actually longer.
  const rendered =
    longestEdge > MAX_IMAGE_EDGE
      ? await ImageManipulator.manipulate(decoded)
          .resize(
            decoded.width >= decoded.height ? { width: MAX_IMAGE_EDGE } : { height: MAX_IMAGE_EDGE }
          )
          .renderAsync()
      : decoded;

  const saved = await rendered.saveAsync({ compress: IMAGE_QUALITY, format: SaveFormat.JPEG });
  return new File(saved.uri);
};

const discardTemporary = (file: File) => {
  try {
    file.delete();
  } catch {
    // A leftover file in the cache directory is the OS's problem to reclaim.
    // Failing the upload over it would be absurd.
  }
};

export type PreparedUpload = {
  file: File;
  /** True when `file` is a re-encoded copy we made and must clean up. */
  temporary: boolean;
};

const prepareUpload = async (
  uri: string,
  declaredMimeType?: string | null
): Promise<PreparedUpload> => {
  const source = new File(uri);
  const mimeType = attachmentMimeType(source, uri, declaredMimeType);

  if (!mimeType.startsWith('image/') || source.size <= COMPRESS_ABOVE_BYTES) {
    return { file: source, temporary: false };
  }

  try {
    const compressed = await compressImage(uri);
    // A flat PNG screenshot can grow when it becomes a JPEG. Send whichever is
    // smaller; the point of this was never the format.
    if (compressed.size >= source.size) {
      discardTemporary(compressed);
      return { file: source, temporary: false };
    }
    return { file: compressed, temporary: true };
  } catch {
    // Compression is an optimisation, never a gate. An image the manipulator
    // cannot read still uploads at its original size.
    return { file: source, temporary: false };
  }
};

/**
 * A receipt photo bound for the AI reader rather than for storage.
 *
 * Unlike `prepareUpload` this always re-encodes, whatever the size: the reader
 * takes JPEG, PNG or WebP only, and an iPhone photo arrives as HEIC. The
 * caller deletes `file` when `temporary` is set, once the request is done.
 */
export const prepareReceiptScanImage = async (uri: string): Promise<PreparedUpload> => {
  try {
    return { file: await compressImage(uri), temporary: true };
  } catch {
    return { file: new File(uri), temporary: false };
  }
};

export const discardPreparedUpload = ({ file, temporary }: PreparedUpload) => {
  if (temporary) discardTemporary(file);
};

/**
 * Uploads a locally picked receipt and resolves to the hosted URL to persist on
 * the entry. Throws on failure — callers must not fall back to storing the
 * local URI, which would be meaningless on any other device.
 */
export const uploadAttachment = async (
  token: string,
  uri: string,
  declaredMimeType?: string | null,
  /** What the file is, in the error a failed upload shows. */
  { noun = 'receipt' }: { noun?: string } = {}
): Promise<string> => {
  const { file, temporary } = await prepareUpload(uri, declaredMimeType);

  try {
    const body = new FormData();

    // The part is a `File` rather than the `{ uri, name, type }` shape React
    // Native used to accept. Expo's fetch builds the multipart body in JS and
    // rejects that shape outright ("Unsupported FormDataPart implementation");
    // `File` carries `name`, `type` and `bytes()`, which is what it reads.
    //
    // Note: no explicit Content-Type header below. It is filled in with the
    // multipart boundary, and setting it by hand drops the boundary and makes
    // the request unparseable on the server.
    body.append('file', file as unknown as Blob);

    const response = await fetch(`${API_BASE_URL}/v1/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    });

    if (!response.ok) {
      throw await readApiError(response, `Unable to upload that ${noun} right now.`, {
        ...uploadFieldLabels,
        file: noun.charAt(0).toUpperCase() + noun.slice(1),
      });
    }

    const data = (await response.json()) as { url?: string };
    if (!data.url) {
      throw new Error(`Unable to upload that ${noun} right now.`);
    }
    return data.url;
  } finally {
    if (temporary) {
      discardTemporary(file);
    }
  }
};

/**
 * Resolves the value to persist on an entry: uploads first if the user picked a
 * new local file, otherwise passes through the existing URL (or null).
 */
export const resolveAttachmentForSave = async (
  token: string,
  attachment: string | null
): Promise<string | null> => {
  if (!attachment) {
    return null;
  }
  if (!isLocalAttachmentUri(attachment)) {
    return attachment;
  }
  return uploadAttachment(token, attachment);
};
