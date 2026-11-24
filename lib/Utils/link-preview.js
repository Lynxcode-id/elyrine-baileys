/**
 * Elyrine Link Preview
 * - Metadata: link-preview-js (optional peer) with fallback to the built-in lightweight scraper.
 * - Thumbnail: adaptive. The aspect ratio of the source image is preserved (16:9 stays 16:9,
 *   1:1 stays 1:1, 9:16 stays 9:16, ...), never cropped and never stretched.
 * - SSRF guard: every hop is resolved and rejected when it points to a private/loopback address.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import { getLinkPreview as getBuiltinLinkPreview } from '../Addon/index.js';
import { prepareWAMessageMedia } from './messages.js';
import { getImageProcessingLibrary } from './messages-media.js';
const URL_PROTOCOL_REGEX = /^https?:\/\//i;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT = 5000;
const DEFAULT_THUMB_SIDE = 192;
const NEWSLETTER_THUMB_SIDE = 320;
const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'Accept-Language': 'en-US,en;q=0.9'
};
// ───────────────────────────── SSRF guard ─────────────────────────────
const isPrivateV4 = (ip) => {
    const [a, b] = ip.split('.').map(Number);
    return (a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 192 && b === 0) ||
        (a === 198 && (b === 18 || b === 19)) ||
        a >= 224);
};
const isPrivateIp = (ip) => {
    if (net.isIPv4(ip))
        return isPrivateV4(ip);
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1')
        return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped)
        return isPrivateV4(mapped[1]);
    return v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
};
/** Throws when the URL is not http(s) or resolves to an internal address. */
export const assertPublicUrl = async (input) => {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('SSRF request detected: only http(s) is allowed');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
        throw new Error('SSRF request detected: internal hostname');
    }
    const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
    if (!addresses.length || addresses.some(a => isPrivateIp(a.address))) {
        throw new Error('SSRF request detected: private address');
    }
    return url;
};
const safeFetch = async (input, { timeout = DEFAULT_TIMEOUT, headers } = {}) => {
    let current = input.toString();
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await assertPublicUrl(current);
        const res = await fetch(current, {
            redirect: 'manual',
            signal: AbortSignal.timeout(timeout),
            headers: { ...DEFAULT_HEADERS, ...headers }
        });
        if (REDIRECT_CODES.has(res.status)) {
            const location = res.headers.get('location');
            await res.body?.cancel();
            if (!location)
                throw new Error('Redirect without location');
            current = new URL(location, current).href;
            continue;
        }
        return res;
    }
    throw new Error('Too many redirects');
};
const readLimited = async (res, maxBytes) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
        size += chunk.length;
        if (size > maxBytes) {
            await res.body.cancel?.();
            throw new Error(`Image exceeds ${maxBytes} bytes`);
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};
// ───────────────────────────── Image helpers ─────────────────────────────
/** Reads the real pixel size from the file header (PNG, JPEG, GIF, WebP). No dependency needed. */
export const probeImageSize = (buf) => {
    if (!Buffer.isBuffer(buf) || buf.length < 24)
        return null;
    if (buf.readUInt32BE(0) === 0x89504e47) {
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf.toString('ascii', 0, 4) === 'GIF8') {
        return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
        const kind = buf.toString('ascii', 12, 16);
        if (kind === 'VP8 ')
            return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
        if (kind === 'VP8L') {
            const b = buf.readUInt32LE(21);
            return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
        }
        if (kind === 'VP8X')
            return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
        return null;
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
        let off = 2;
        while (off + 9 < buf.length) {
            if (buf[off] !== 0xff) {
                off++;
                continue;
            }
            const marker = buf[off + 1];
            if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
                off += 2;
                continue;
            }
            const len = buf.readUInt16BE(off + 2);
            const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
            if (isSof)
                return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
            off += 2 + len;
        }
    }
    return null;
};
/** Human readable ratio, snapped to the common ones (16:9, 4:3, 1:1, 9:16 ...) */
export const classifyAspectRatio = (width, height) => {
    if (!width || !height)
        return 'unknown';
    const r = width / height;
    const known = [['16:9', 16 / 9], ['4:3', 4 / 3], ['3:2', 3 / 2], ['1:1', 1], ['3:4', 3 / 4], ['2:3', 2 / 3], ['9:16', 9 / 16], ['21:9', 21 / 9], ['1.91:1', 1.91]];
    const hit = known.find(([, v]) => Math.abs(r - v) / v < 0.03);
    return hit ? hit[0] : `${r.toFixed(2)}:1`;
};
const fitInside = (width, height, maxSide) => {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};
/**
 * Builds a JPEG thumbnail that keeps the ratio of the source (no crop, no stretch, no upscaling).
 * @returns { buffer, width, height, original: {width,height}, aspect }
 */
export const makeAdaptiveThumbnail = async (input, { maxSide = DEFAULT_THUMB_SIDE, quality = 60 } = {}) => {
    const lib = await getImageProcessingLibrary();
    if ('sharp' in lib && lib.sharp?.default) {
        const meta = await lib.sharp.default(input).metadata();
        const swap = meta.orientation >= 5;
        const original = { width: swap ? meta.height : meta.width, height: swap ? meta.width : meta.height };
        const { data, info } = await lib.sharp.default(input)
            .rotate()
            .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality })
            .toBuffer({ resolveWithObject: true });
        return { buffer: data, width: info.width, height: info.height, original, aspect: classifyAspectRatio(original.width, original.height) };
    }
    const original = probeImageSize(input);
    if ('image' in lib && lib.image?.Transformer) {
        const t = new lib.image.Transformer(input);
        const dims = original ?? await t.metadata();
        const size = fitInside(dims.width, dims.height, maxSide);
        const buffer = await new lib.image.Transformer(input).resize(size.width, size.height, 0).jpeg(quality);
        return { buffer, ...size, original: { width: dims.width, height: dims.height }, aspect: classifyAspectRatio(dims.width, dims.height) };
    }
    if ('jimp' in lib && lib.jimp?.Jimp) {
        const img = await lib.jimp.Jimp.read(input);
        const dims = { width: img.width, height: img.height };
        const size = fitInside(dims.width, dims.height, maxSide);
        const buffer = await img.resize({ w: size.width, h: size.height, mode: lib.jimp.ResizeStrategy.BILINEAR }).getBuffer('image/jpeg', { quality });
        return { buffer, ...size, original: dims, aspect: classifyAspectRatio(dims.width, dims.height) };
    }
    throw new Error('No image processing library available');
};
/** Accepts a Buffer, an http(s) URL or a local file path */
const loadImageBuffer = async (source, opts) => {
    if (Buffer.isBuffer(source))
        return source;
    if (typeof source !== 'string')
        throw new TypeError('thumbnail must be a Buffer, URL or file path');
    if (URL_PROTOCOL_REGEX.test(source)) {
        const res = await safeFetch(source, { timeout: opts.timeout, headers: { Accept: 'image/*', ...opts.headers } });
        if (!res.ok)
            throw new Error(`Failed to fetch image: HTTP ${res.status}`);
        return readLimited(res, MAX_IMAGE_BYTES);
    }
    const { readFile } = await import('node:fs/promises');
    return readFile(source);
};
// ───────────────────────────── Metadata ─────────────────────────────
let linkPreviewJs;
const loadLinkPreviewJs = async () => {
    if (linkPreviewJs !== undefined)
        return linkPreviewJs;
    try {
        linkPreviewJs = await import('link-preview-js');
    }
    catch {
        linkPreviewJs = null;
    }
    return linkPreviewJs;
};
const sameSite = (a, b) => {
    const x = new URL(a).hostname.replace(/^www\./, '');
    const y = new URL(b).hostname.replace(/^www\./, '');
    return x === y;
};
/** Normalised metadata: { url, title, description, siteName, image, video, favicon } */
export const fetchLinkMetadata = async (link, { timeout = DEFAULT_TIMEOUT, headers } = {}) => {
    const url = URL_PROTOCOL_REGEX.test(link) ? link : 'https://' + link;
    await assertPublicUrl(url);
    const lib = await loadLinkPreviewJs();
    const getter = lib?.getLinkPreview ?? lib?.default?.getLinkPreview;
    if (getter) {
        const info = await getter(url, {
            timeout,
            headers: { ...DEFAULT_HEADERS, ...headers },
            followRedirects: 'manual',
            handleRedirects: (base, forwarded) => sameSite(base, forwarded)
        });
        return {
            url: info.url,
            title: info.title,
            description: info.description,
            siteName: info.siteName,
            image: info.images?.[0],
            video: info.videos?.[0]?.url,
            favicon: info.favicons?.[0]
        };
    }
    const info = await getBuiltinLinkPreview(url, timeout);
    return { url: info.url, title: info.title, description: info.description, image: info.image, video: info.video, favicon: info.favicon };
};
// ───────────────────────────── Builder ─────────────────────────────
/**
 * Builds the `linkPreview` object understood by sendMessage({ text, linkPreview }).
 * Anything passed in `custom` (title, description, thumbnail, favicon ...) overrides the scraped value.
 */
export const buildLinkPreview = async (link, custom = {}, opts = {}) => {
    const { timeout = DEFAULT_TIMEOUT, headers, upload, logger, newsletter = false } = opts;
    const hasAll = custom.title && custom.thumbnail !== undefined;
    let meta = {};
    if (!hasAll) {
        try {
            meta = await fetchLinkMetadata(link, { timeout, headers });
        }
        catch (error) {
            if (!custom.title)
                throw error;
            logger?.debug({ err: error?.message }, 'metadata fetch failed, using custom data');
        }
    }
    const canonical = custom.canonicalUrl ?? meta.url ?? link;
    const title = custom.title ?? meta.title;
    if (!title)
        return undefined;
    const urlInfo = {
        'canonical-url': canonical,
        'matched-text': custom.matchedText ?? link,
        title,
        description: custom.description ?? meta.description,
        originalThumbnailUrl: typeof custom.thumbnail === 'string' ? custom.thumbnail : meta.image,
        'preview-type': custom.previewType ?? (meta.video ? 1 : 0)
    };
    const imageSource = custom.thumbnail ?? meta.image;
    if (imageSource) {
        try {
            const raw = await loadImageBuffer(imageSource, { timeout, headers });
            const thumb = await makeAdaptiveThumbnail(raw, {
                maxSide: custom.thumbnailSize ?? (newsletter ? NEWSLETTER_THUMB_SIDE : DEFAULT_THUMB_SIDE)
            });
            urlInfo.jpegThumbnail = thumb.buffer;
            urlInfo.thumbnailInfo = { width: thumb.width, height: thumb.height, original: thumb.original, aspect: thumb.aspect };
            // High quality: upload the untouched original, with its real resolution.
            if (upload && !newsletter && custom.highQuality !== false) {
                const { imageMessage } = await prepareWAMessageMedia({ image: raw, jpegThumbnail: thumb.buffer }, { upload, mediaTypeOverride: 'thumbnail-link', options: { timeout } });
                imageMessage.width = thumb.original.width;
                imageMessage.height = thumb.original.height;
                urlInfo.highQualityThumbnail = imageMessage;
            }
        }
        catch (error) {
            logger?.debug({ err: error?.message, url: link }, 'error in generating thumbnail');
        }
    }
    const faviconSource = custom.favicon ?? meta.favicon;
    if (faviconSource && upload && !newsletter) {
        try {
            const raw = await loadImageBuffer(faviconSource, { timeout, headers });
            const { imageMessage } = await prepareWAMessageMedia({ image: raw }, { upload, mediaTypeOverride: 'thumbnail-link', options: { timeout } });
            urlInfo.favicon = imageMessage;
        }
        catch (error) {
            logger?.debug({ err: error?.message }, 'favicon skipped');
        }
    }
    return urlInfo;
};
/**
 * Drop-in `getUrlInfo` used by sendMessage for automatic previews.
 * Returns undefined when the page has no usable title.
 */
export const getUrlInfo = async (text, opts = {}) => {
    const { fetchOpts = {}, uploadImage, logger, thumbnailWidth, newsletter } = opts;
    try {
        return await buildLinkPreview(text, { thumbnailSize: thumbnailWidth }, {
            timeout: fetchOpts.timeout ?? DEFAULT_TIMEOUT,
            headers: fetchOpts.headers,
            upload: uploadImage,
            logger,
            newsletter
        });
    }
    catch (error) {
        if (error?.message?.includes('SSRF') || error?.message?.includes('receive a valid')) {
            logger?.debug({ err: error.message }, 'link preview skipped');
            return undefined;
        }
        throw error;
    }
};
