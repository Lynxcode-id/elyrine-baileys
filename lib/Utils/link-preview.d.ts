export type WAMediaUploadFunction = (filePath: string, opts: { fileEncSha256B64: string; mediaType: string; timeoutMs?: number; newsletter?: boolean }) => Promise<{ mediaUrl: string; directPath: string; [k: string]: any }>;
export type ThumbnailInfo = {
    width: number;
    height: number;
    original: { width: number; height: number };
    aspect: string;
};
export type LinkMetadata = {
    url: string;
    title?: string;
    description?: string;
    siteName?: string;
    image?: string;
    video?: string;
    favicon?: string;
};
export type CustomLinkPreview = {
    title?: string;
    description?: string;
    /** Buffer, http(s) URL or local file path. Ratio is preserved automatically. */
    thumbnail?: Buffer | string;
    favicon?: Buffer | string;
    canonicalUrl?: string;
    matchedText?: string;
    previewType?: number;
    /** Longest side of the inline JPEG thumbnail (default 192, 320 for channels) */
    thumbnailSize?: number;
    /** Upload the original image in full resolution (default true) */
    highQuality?: boolean;
};
export type LinkPreviewBuildOptions = {
    timeout?: number;
    headers?: Record<string, string>;
    upload?: WAMediaUploadFunction;
    logger?: any;
    newsletter?: boolean;
};
export function assertPublicUrl(url: string): Promise<URL>;
export function probeImageSize(buffer: Buffer): { width: number; height: number } | null;
export function classifyAspectRatio(width: number, height: number): string;
export function makeAdaptiveThumbnail(input: Buffer, opts?: { maxSide?: number; quality?: number }): Promise<{ buffer: Buffer; width: number; height: number; original: { width: number; height: number }; aspect: string }>;
export function fetchLinkMetadata(link: string, opts?: { timeout?: number; headers?: Record<string, string> }): Promise<LinkMetadata>;
export function buildLinkPreview(link: string, custom?: CustomLinkPreview, opts?: LinkPreviewBuildOptions): Promise<any | undefined>;
export function getUrlInfo(text: string, opts?: {
    thumbnailWidth?: number;
    fetchOpts?: { timeout?: number; headers?: Record<string, string>; [k: string]: any };
    uploadImage?: WAMediaUploadFunction;
    logger?: any;
    newsletter?: boolean;
}): Promise<any | undefined>;
