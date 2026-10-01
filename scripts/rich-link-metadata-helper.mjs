#!/usr/bin/env node
import { lookup as dnsLookup } from 'node:dns/promises';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const DEFAULT_PORT = 5280;
const MAX_PORT = 65535;
const MIN_PORT = 1024;
const MAX_REQUEST_BYTES = 4096;
const MAX_TARGET_URL_LENGTH = 2048;
const MAX_RESPONSE_BYTES = 128 * 1024;
const MAX_IMAGE_BYTES = 512 * 1024;
const MAX_IMAGE_PIXELS = 8_000_000;
const MAX_CONCURRENT_FETCHES = 4;
let activeDnsLookups = 0;
const MAX_REDIRECTS = 3;
const TOTAL_FETCH_TIMEOUT_MS = 12_000;
const DNS_TIMEOUT_MS = 3_000;
const SERVER_HEADERS_TIMEOUT_MS = 5_000;
const SERVER_REQUEST_TIMEOUT_MS = 8_000;
const INTERNAL_SUFFIXES = [
  'localhost', 'local', 'internal', 'test', 'example', 'invalid', 'onion',
  'home.arpa', 'lan', 'home', 'intranet', 'corp', 'private'
];

class HelperError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isPrivateOrSpecialIpv4(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const value = octets.reduce((total, part) => total * 256n + BigInt(part), 0n);
  const blocked = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
    ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
    ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
  ];
  return blocked.some(([network, bits]) => {
    const base = network.split('.').map(Number).reduce((total, part) => total * 256n + BigInt(part), 0n);
    return (value >> BigInt(32 - bits)) === (base >> BigInt(32 - bits));
  });
}

function ipv6BigInt(address) {
  let source = String(address).toLowerCase();
  if (!source || source.includes('%')) return null;
  if (source.includes('.')) {
    const separator = source.lastIndexOf(':');
    const ipv4 = source.slice(separator + 1);
    if (separator < 0 || isIP(ipv4) !== 4) return null;
    const octets = ipv4.split('.').map(Number);
    const upper = ((octets[0] << 8) | octets[1]).toString(16);
    const lower = ((octets[2] << 8) | octets[3]).toString(16);
    source = source.slice(0, separator + 1) + upper + ':' + lower;
  }
  const halves = source.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  if ((halves.length === 1 && left.length !== 8) || (halves.length === 2 && fill < 1)) return null;
  const groups = left.concat(Array(fill).fill('0'), right);
  if (groups.length !== 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return groups.reduce((value, part) => (value << 16n) | BigInt('0x' + part), 0n);
}

function isPrivateOrSpecialIpv6(address) {
  const value = ipv6BigInt(address);
  if (value == null) return true;
  const groups = String(address).toLowerCase().split(':');
  const first = Number.parseInt(groups[0] || '0', 16);
  const second = Number.parseInt(groups[1] || '0', 16);
  const third = Number.parseInt(groups[2] || '0', 16);
  const globallyRoutable = (value >> 125n) === 1n; // 2000::/3
  const protocolAssignment = first === 0x2001 && second <= 0x01ff; // 2001::/23
  const documentation = first === 0x2001 && second === 0x0db8; // 2001:db8::/32
  const documentationV2 = first === 0x3fff && second <= 0x0fff; // 3fff::/20
  const nat64 = first === 0x0064 && second === 0xff9b && third <= 1;
  const sixToFour = first === 0x2002;
  return !globallyRoutable || protocolAssignment || documentation || documentationV2 || nat64 || sixToFour;
}

function isPublicAddress(address, family) {
  const detectedFamily = family || isIP(address);
  if (detectedFamily === 4) return !isPrivateOrSpecialIpv4(address);
  if (detectedFamily === 6) return !isPrivateOrSpecialIpv6(address);
  return false;
}

function normalizedHostname(url) {
  return String(url.hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
}

function validatePublicHostname(hostname) {
  if (!hostname || hostname.length > 253 || hostname.endsWith('.') || hostname.includes('%')) {
    throw new HelperError(400, 'invalid_url', 'Enter a public HTTP or HTTPS page URL.');
  }
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname, isIP(hostname))) throw new HelperError(400, 'blocked_destination', 'Private and reserved destinations are not allowed.');
    return;
  }
  if (!hostname.includes('.') || !/^[a-z0-9.-]+$/.test(hostname)) {
    throw new HelperError(400, 'blocked_destination', 'Only public internet hostnames are allowed.');
  }
  const labels = hostname.split('.');
  if (labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new HelperError(400, 'invalid_url', 'Enter a valid public page URL.');
  }
  if (INTERNAL_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith('.' + suffix))) {
    throw new HelperError(400, 'blocked_destination', 'Internal hostnames are not allowed.');
  }
}

function validateTargetUrl(raw, base) {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_TARGET_URL_LENGTH || raw !== raw.trim() || /[\u0000-\u001f\u007f]/.test(raw)) {
    throw new HelperError(400, 'invalid_url', 'Enter a public HTTP or HTTPS page URL under 2,048 characters.');
  }
  if (!base && !/^https?:\/\//i.test(raw)) throw new HelperError(400, 'invalid_url', 'Enter a full HTTP or HTTPS page URL.');
  let url;
  try { url = base ? new URL(raw, base) : new URL(raw); }
  catch { throw new HelperError(400, 'invalid_url', 'Enter a valid public HTTP or HTTPS page URL.'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new HelperError(400, 'invalid_url', 'Only HTTP and HTTPS pages are supported.');
  if (url.username || url.password || url.hash || raw.includes('#')) throw new HelperError(400, 'invalid_url', 'URLs with credentials or fragments are not allowed.');
  const expectedPort = url.protocol === 'https:' ? 443 : 80;
  const port = url.port ? Number(url.port) : expectedPort;
  if (![80, 443].includes(port) || port !== expectedPort) throw new HelperError(400, 'blocked_destination', 'Only standard HTTP and HTTPS ports are allowed.');
  if (url.href.length > MAX_TARGET_URL_LENGTH || (url.pathname + url.search).length > 1792) throw new HelperError(400, 'invalid_url', 'The page URL is too long.');
  validatePublicHostname(normalizedHostname(url));
  return url;
}

function validateCallerOrigin(value) {
  if (typeof value !== 'string' || !value) throw new Error('Pass an explicit --origin with the Sutra app origin.');
  let origin;
  try { origin = new URL(value); } catch { throw new Error('--origin must be an exact HTTP or HTTPS origin.'); }
  if ((origin.protocol !== 'http:' && origin.protocol !== 'https:') || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || value !== origin.origin) {
    throw new Error('--origin must be an exact HTTP or HTTPS origin with no path, credentials, query, or fragment.');
  }
  return origin.origin;
}

function parseArguments(argv) {
  let originValue = '';
  let portValue = String(DEFAULT_PORT);
  let portSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--origin') {
      if (originValue || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error('--origin requires one exact app origin.');
      originValue = argv[++index];
    } else if (flag === '--port') {
      if (portSeen || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error('--port requires one port number.');
      portSeen = true;
      portValue = argv[++index];
    } else if (flag === '--help' || flag === '-h') {
      return { help: true };
    } else {
      throw new Error('Unknown option: ' + flag);
    }
  }
  const origin = validateCallerOrigin(originValue);
  if (!/^\d{1,5}$/.test(portValue)) throw new Error('--port must be an integer from ' + MIN_PORT + ' to ' + MAX_PORT + '.');
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) throw new Error('--port must be an integer from ' + MIN_PORT + ' to ' + MAX_PORT + '.');
  return { origin, port };
}

function jsonResponse(response, status, payload, origin) {
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(payload));
}

function expectedHostHeaders(port) {
  const portPart = port === 80 ? '' : ':' + port;
  return new Set(['127.0.0.1' + portPart, 'localhost' + portPart]);
}

function readJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    function fail(error) {
      if (settled) return;
      settled = true;
      rejectBody(error);
    }
    request.on('error', fail);
    request.on('aborted', () => fail(new HelperError(400, 'request_aborted', 'The metadata request was interrupted.')));
    const length = request.headers['content-length'];
    if (length != null && (!/^\d+$/.test(String(length)) || Number(length) > MAX_REQUEST_BYTES)) {
      fail(new HelperError(413, 'request_too_large', 'The metadata request is too large.'));
      request.destroy();
      return;
    }
    request.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        fail(new HelperError(413, 'request_too_large', 'The metadata request is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
        resolveBody(JSON.parse(text));
      } catch {
        rejectBody(new HelperError(400, 'invalid_json', 'The metadata request must contain valid JSON.'));
      }
    });
  });
}

function remainingTime(deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new HelperError(504, 'fetch_timeout', 'The page took too long to respond.');
  return remaining;
}

async function resolvePublicTarget(url, deadline, signal) {
  const hostname = normalizedHostname(url);
  const family = isIP(hostname);
  if (family) return { address: hostname, family };
  if (signal && signal.aborted) throw new HelperError(499, 'request_cancelled', 'The metadata request was cancelled.');
  const timeout = Math.min(DNS_TIMEOUT_MS, remainingTime(deadline));
  if (activeDnsLookups >= MAX_CONCURRENT_FETCHES) throw new HelperError(429, 'dns_busy', 'The metadata helper is still checking page addresses. Try again shortly.');
  activeDnsLookups += 1;
  // Lookup cannot be cancelled: hold its slot until the actual resolver settles.
  const lookup = Promise.resolve().then(() => {
    if (signal && signal.aborted) throw new HelperError(499, 'request_cancelled', 'The metadata request was cancelled.');
    return dnsLookup(hostname, { all: true, verbatim: true });
  }).finally(() => { activeDnsLookups = Math.max(0, activeDnsLookups - 1); });
  let timer;
  let abortHandler;
  try {
    const tasks = [
      lookup,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new HelperError(504, 'dns_timeout', 'The page address could not be checked in time.')), timeout); })
    ];
    if (signal) {
      tasks.push(new Promise((_, reject) => {
        abortHandler = () => reject(new HelperError(499, 'request_cancelled', 'The metadata request was cancelled.'));
        signal.addEventListener('abort', abortHandler, { once: true });
        if (signal.aborted) abortHandler();
      }));
    }
    const addresses = await Promise.race(tasks);
    if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address, entry.family))) {
      throw new HelperError(400, 'blocked_destination', 'The page resolves to a private or reserved address.');
    }
    return addresses[0];
  } catch (error) {
    if (error instanceof HelperError) throw error;
    throw new HelperError(502, 'dns_failed', 'The public page address could not be resolved safely.');
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
  }
}

function requestPage(url, pinnedAddress, deadline, signal) {
  return new Promise((resolveResponse, rejectResponse) => {
    let settled = false;
    let requestTimer;
    let abortHandler;
    function finish(error, value) {
      if (settled) return;
      settled = true;
      if (requestTimer) clearTimeout(requestTimer);
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
      if (error) rejectResponse(error); else resolveResponse(value);
    }
    const hostname = normalizedHostname(url);
    const family = pinnedAddress.family || isIP(pinnedAddress.address);
    const client = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const options = {
      protocol: url.protocol,
      hostname,
      port: url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80),
      method: 'GET',
      path: url.pathname + url.search,
      headers: {
        Accept: 'text/html, application/xhtml+xml;q=0.9, text/plain;q=0.5',
        'Accept-Encoding': 'identity',
        Host: url.host,
        'User-Agent': 'Sutra-Rich-Link-Metadata/1.0'
      },
      agent: false,
      maxHeaderSize: 8192,
      lookup: (_host, _options, callback) => callback(null, pinnedAddress.address, family)
    };
    if (url.protocol === 'https:') {
      options.rejectUnauthorized = true;
      options.minVersion = 'TLSv1.2';
      if (!isIP(hostname)) options.servername = hostname;
    }
    let outgoing;
    try { outgoing = client(options, (response) => {
      response.on('error', () => finish(new HelperError(502, 'remote_read_failed', 'The page response could not be read.')));
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.destroy();
        finish(null, { status, location });
        return;
      }
      if (status !== 200) {
        response.destroy();
        finish(new HelperError(502, 'remote_status', 'The page did not return a readable response.'));
        return;
      }
      const contentType = String(response.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
      if (!['text/html', 'application/xhtml+xml', 'text/plain'].includes(contentType)) {
        response.destroy();
        finish(new HelperError(415, 'unsupported_content', 'Only HTML or plain-text pages are supported.'));
        return;
      }
      const contentEncoding = String(response.headers['content-encoding'] || 'identity').toLowerCase();
      if (contentEncoding !== 'identity') {
        response.destroy();
        finish(new HelperError(415, 'unsupported_encoding', 'Compressed page responses are not supported.'));
        return;
      }
      const contentLength = response.headers['content-length'];
      if (contentLength != null && (!/^\d+$/.test(String(contentLength)) || Number(contentLength) > MAX_RESPONSE_BYTES)) {
        response.destroy();
        finish(new HelperError(413, 'response_too_large', 'The page response is too large to inspect safely.'));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          response.destroy();
          outgoing.destroy();
          finish(new HelperError(413, 'response_too_large', 'The page response is too large to inspect safely.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => finish(null, { status, body: Buffer.concat(chunks), contentType }));
    }); } catch {
      finish(new HelperError(502, 'connection_failed', 'The public page could not be reached safely.'));
      return;
    }
    let timeoutMs;
    try { timeoutMs = remainingTime(deadline); }
    catch (error) { outgoing.destroy(); finish(error); return; }
    requestTimer = setTimeout(() => {
      outgoing.destroy(new Error('metadata request timed out'));
      finish(new HelperError(504, 'fetch_timeout', 'The page took too long to respond.'));
    }, timeoutMs);
    if (requestTimer.unref) requestTimer.unref();
    if (signal) {
      abortHandler = () => {
        outgoing.destroy();
        finish(new HelperError(499, 'request_cancelled', 'The metadata request was cancelled.'));
      };
      if (signal.aborted) { abortHandler(); return; }
      signal.addEventListener('abort', abortHandler, { once: true });
    }
    outgoing.on('error', () => finish(new HelperError(502, 'connection_failed', 'The public page could not be reached safely.')));
    outgoing.end();
  });
}

function requestImage(url, pinnedAddress, deadline, signal) {
  return new Promise((resolveResponse, rejectResponse) => {
    let settled = false;
    let requestTimer;
    let abortHandler;
    function finish(error, value) {
      if (settled) return;
      settled = true;
      if (requestTimer) clearTimeout(requestTimer);
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
      if (error) rejectResponse(error); else resolveResponse(value);
    }
    const hostname = normalizedHostname(url);
    const family = pinnedAddress.family || isIP(pinnedAddress.address);
    const options = {
      protocol: 'https:',
      hostname,
      port: 443,
      method: 'GET',
      path: url.pathname + url.search,
      headers: {
        Accept: 'image/png, image/jpeg, image/webp',
        'Accept-Encoding': 'identity',
        Host: url.host,
        'User-Agent': 'Sutra-Rich-Link-Metadata/1.0'
      },
      agent: false,
      maxHeaderSize: 8192,
      lookup: (_host, _options, callback) => callback(null, pinnedAddress.address, family),
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2'
    };
    if (!isIP(hostname)) options.servername = hostname;
    let outgoing;
    try { outgoing = httpsRequest(options, (response) => {
      response.on('error', () => finish(new HelperError(502, 'image_read_failed', 'The page image could not be read safely.')));
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.destroy();
        finish(null, { status, location });
        return;
      }
      if (status !== 200) {
        response.destroy();
        finish(new HelperError(502, 'image_status', 'The page image was unavailable.'));
        return;
      }
      const contentType = String(response.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) {
        response.destroy();
        finish(new HelperError(415, 'image_type', 'The page image type is not supported.'));
        return;
      }
      const contentEncoding = String(response.headers['content-encoding'] || 'identity').toLowerCase();
      if (contentEncoding !== 'identity') {
        response.destroy();
        finish(new HelperError(415, 'image_encoding', 'Compressed page images are not supported.'));
        return;
      }
      const contentLength = response.headers['content-length'];
      if (contentLength != null && (!/^\d+$/.test(String(contentLength)) || Number(contentLength) > MAX_IMAGE_BYTES)) {
        response.destroy();
        finish(new HelperError(413, 'image_too_large', 'The page image is larger than 512 KiB.'));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_IMAGE_BYTES) {
          response.destroy();
          outgoing.destroy();
          finish(new HelperError(413, 'image_too_large', 'The page image is larger than 512 KiB.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => finish(null, { status, body: Buffer.concat(chunks), contentType }));
    }); } catch {
      finish(new HelperError(502, 'image_connection_failed', 'The page image could not be reached safely.'));
      return;
    }
    let timeoutMs;
    try { timeoutMs = remainingTime(deadline); }
    catch (error) { outgoing.destroy(); finish(error); return; }
    requestTimer = setTimeout(() => {
      outgoing.destroy(new Error('image metadata request timed out'));
      finish(new HelperError(504, 'image_timeout', 'The page image took too long to respond.'));
    }, timeoutMs);
    if (requestTimer.unref) requestTimer.unref();
    if (signal) {
      abortHandler = () => {
        outgoing.destroy();
        finish(new HelperError(499, 'request_cancelled', 'The metadata request was cancelled.'));
      };
      if (signal.aborted) { abortHandler(); return; }
      signal.addEventListener('abort', abortHandler, { once: true });
    }
    outgoing.on('error', () => finish(new HelperError(502, 'image_connection_failed', 'The page image could not be reached safely.')));
    outgoing.end();
  });
}

function invalidImage() {
  throw new HelperError(415, 'image_invalid', 'The page image was not a supported, verified image.');
}

function verifyImageDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
      || width > 4096 || height > 4096 || width * height > MAX_IMAGE_PIXELS) invalidImage();
  return { width, height };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function verifyPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(signature)) invalidImage();
  const allowed = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'sRGB', 'gAMA', 'cHRM', 'pHYs', 'bKGD']);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let seenIhdr = false;
  let seenPlte = false;
  let seenIdat = false;
  let idatBytes = 0;
  let endedIdat = false;
  let seenIend = false;
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) invalidImage();
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const crcOffset = dataStart + length;
    if (!/^[A-Z][A-Za-z]{3}$/.test(type) || crcOffset + 4 > buffer.length || !allowed.has(type)) invalidImage();
    if (crc32(buffer.subarray(offset + 4, crcOffset)) !== buffer.readUInt32BE(crcOffset)) invalidImage();
    if (!seenIhdr && type !== 'IHDR') invalidImage();
    if (type === 'IHDR') {
      if (seenIhdr || length !== 13 || offset !== 8) invalidImage();
      seenIhdr = true;
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      colorType = buffer[dataStart + 9];
      const depth = buffer[dataStart + 8];
      const depthAllowed = (colorType === 0 && [1, 2, 4, 8, 16].includes(depth))
        || (colorType === 2 && [8, 16].includes(depth))
        || (colorType === 3 && [1, 2, 4, 8].includes(depth))
        || ((colorType === 4 || colorType === 6) && [8, 16].includes(depth));
      if (!depthAllowed || buffer[dataStart + 10] !== 0 || buffer[dataStart + 11] !== 0 || buffer[dataStart + 12] !== 0) invalidImage();
      verifyImageDimensions(width, height);
    } else if (type === 'PLTE') {
      if (seenPlte || seenIdat || length < 3 || length > 768 || length % 3 !== 0 || colorType === 0 || colorType === 4) invalidImage();
      seenPlte = true;
    } else if (type === 'IDAT') {
      if (endedIdat || (colorType === 3 && !seenPlte)) invalidImage();
      seenIdat = true;
      idatBytes += length;
    } else if (type === 'IEND') {
      if (length !== 0 || !seenIdat || seenIend || crcOffset + 4 !== buffer.length) invalidImage();
      seenIend = true;
    } else {
      if (seenIdat) endedIdat = true;
      const limit = type === 'cHRM' ? 32 : type === 'pHYs' ? 9 : type === 'gAMA' ? 4 : type === 'sRGB' ? 1 : 768;
      if (seenIdat || length > limit) invalidImage();
      if ((type === 'sRGB' && length !== 1) || (type === 'gAMA' && length !== 4)
          || (type === 'cHRM' && length !== 32) || (type === 'pHYs' && length !== 9)) invalidImage();
    }
    offset = crcOffset + 4;
    if (type === 'IEND') break;
  }
  if (!seenIhdr || !seenIdat || !idatBytes || !seenIend) invalidImage();
  return { width, height, mime: 'image/png' };
}

function verifyJpegTables(buffer, start, end, isHuffman) {
  let offset = start;
  while (offset < end) {
    const info = buffer[offset++];
    const tableClass = info >> 4;
    const tableId = info & 0x0f;
    if (tableId > 3 || (isHuffman ? tableClass > 1 : tableClass > 1)) invalidImage();
    if (isHuffman) {
      if (offset + 16 > end) invalidImage();
      let symbols = 0;
      for (let index = 0; index < 16; index += 1) symbols += buffer[offset + index];
      offset += 16;
      if (symbols < 1 || symbols > 256 || offset + symbols > end) invalidImage();
      offset += symbols;
    } else {
      const precision = tableClass;
      const bytes = 64 * (precision + 1);
      if (offset + bytes > end) invalidImage();
      offset += bytes;
    }
  }
  if (offset !== end) invalidImage();
}

function verifyJpeg(buffer) {
  if (buffer.length < 16 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== 0xd9) invalidImage();
  let offset = 2;
  let width = 0;
  let height = 0;
  let componentCount = 0;
  let seenFrame = false;
  let seenJfif = false;
  let seenQuantization = false;
  let seenHuffman = false;
  let seenScan = false;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) invalidImage();
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xd9) {
      if (offset !== buffer.length || !seenFrame || !seenScan) invalidImage();
      return verifyImageDimensions(width, height) && { width, height, mime: 'image/jpeg' };
    }
    if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || offset + 2 > buffer.length) invalidImage();
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) invalidImage();
    const payloadStart = offset + 2;
    const payloadEnd = offset + segmentLength;
    if (marker === 0xe0) {
      if (seenJfif || seenFrame || payloadEnd - payloadStart < 14 || buffer.toString('ascii', payloadStart, payloadStart + 5) !== 'JFIF\u0000') invalidImage();
      const thumbWidth = buffer[payloadStart + 12];
      const thumbHeight = buffer[payloadStart + 13];
      if (payloadEnd - payloadStart !== 14 + thumbWidth * thumbHeight * 3) invalidImage();
      seenJfif = true;
    } else if (marker === 0xdb) {
      if (seenScan) invalidImage();
      verifyJpegTables(buffer, payloadStart, payloadEnd, false);
      seenQuantization = true;
    } else if (marker === 0xc4) {
      if (seenScan) invalidImage();
      verifyJpegTables(buffer, payloadStart, payloadEnd, true);
      seenHuffman = true;
    } else if (marker === 0xdd) {
      if (seenScan || segmentLength !== 4) invalidImage();
    } else if (marker === 0xc0) {
      if (seenFrame || seenScan || segmentLength < 11 || buffer[payloadStart] !== 8) invalidImage();
      height = buffer.readUInt16BE(payloadStart + 1);
      width = buffer.readUInt16BE(payloadStart + 3);
      componentCount = buffer[payloadStart + 5];
      if (![1, 3].includes(componentCount) || segmentLength !== 8 + componentCount * 3) invalidImage();
      for (let index = 0; index < componentCount; index += 1) {
        const sampling = buffer[payloadStart + 7 + index * 3];
        if ((sampling >> 4) < 1 || (sampling >> 4) > 4 || (sampling & 0x0f) < 1 || (sampling & 0x0f) > 4) invalidImage();
      }
      verifyImageDimensions(width, height);
      seenFrame = true;
    } else if (marker === 0xda) {
      if (!seenFrame || seenScan || !seenQuantization || !seenHuffman || segmentLength !== 6 + 2 * componentCount
          || buffer[payloadStart] !== componentCount || buffer[payloadEnd - 3] !== 0 || buffer[payloadEnd - 2] !== 63 || buffer[payloadEnd - 1] !== 0) invalidImage();
      seenScan = true;
      offset = payloadEnd;
      while (offset < buffer.length - 1) {
        if (buffer[offset++] !== 0xff) continue;
        while (buffer[offset] === 0xff) offset += 1;
        const scanMarker = buffer[offset++];
        if (scanMarker === 0x00 || (scanMarker >= 0xd0 && scanMarker <= 0xd7)) continue;
        if (scanMarker === 0xd9 && offset === buffer.length) return verifyImageDimensions(width, height) && { width, height, mime: 'image/jpeg' };
        invalidImage();
      }
      invalidImage();
    } else {
      invalidImage(); // Reject metadata, comments, progressive scans, and unknown markers.
    }
    offset = payloadEnd;
  }
  invalidImage();
}

function verifyWebp(buffer) {
  if (buffer.length < 26 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP'
      || buffer.readUInt32LE(4) + 8 !== buffer.length) invalidImage();
  let offset = 12;
  let extended = false;
  let alpha = false;
  let alphaChunk = false;
  let imageChunk = '';
  let width = 0;
  let height = 0;
  const chunks = [];
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) invalidImage();
    const type = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const next = dataEnd + (length % 2);
    if (dataEnd > buffer.length || next > buffer.length || (length % 2 && buffer[dataEnd] !== 0)) invalidImage();
    chunks.push({ type, length, dataStart, dataEnd });
    offset = next;
  }
  if (offset !== buffer.length || !chunks.length) invalidImage();
  let chunkIndex = 0;
  if (chunks[0].type === 'VP8X') {
    const chunk = chunks[0];
    if (chunk.length !== 10) invalidImage();
    extended = true;
    const flags = buffer[chunk.dataStart];
    if ((flags & ~0x10) !== 0 || buffer[chunk.dataStart + 1] || buffer[chunk.dataStart + 2] || buffer[chunk.dataStart + 3]) invalidImage();
    alpha = !!(flags & 0x10);
    width = buffer.readUIntLE(chunk.dataStart + 4, 3) + 1;
    height = buffer.readUIntLE(chunk.dataStart + 7, 3) + 1;
    verifyImageDimensions(width, height);
    chunkIndex = 1;
  }
  if (chunks[chunkIndex] && chunks[chunkIndex].type === 'ALPH') {
    if (!extended || !alpha || chunks[chunkIndex].length < 1) invalidImage();
    alphaChunk = true;
    chunkIndex += 1;
  }
  const image = chunks[chunkIndex];
  if (!image || chunks.length !== chunkIndex + 1 || !['VP8 ', 'VP8L'].includes(image.type)) invalidImage();
  imageChunk = image.type;
  if (imageChunk === 'VP8 ') {
    if (image.length < 10 || buffer[image.dataStart] & 1 || buffer[image.dataStart + 3] !== 0x9d
        || buffer[image.dataStart + 4] !== 0x01 || buffer[image.dataStart + 5] !== 0x2a) invalidImage();
    const frameWidth = buffer.readUInt16LE(image.dataStart + 6) & 0x3fff;
    const frameHeight = buffer.readUInt16LE(image.dataStart + 8) & 0x3fff;
    verifyImageDimensions(frameWidth, frameHeight);
    if (extended && (width !== frameWidth || height !== frameHeight || alpha !== alphaChunk)) invalidImage();
    width = frameWidth;
    height = frameHeight;
  } else {
    if (image.length < 5 || buffer[image.dataStart] !== 0x2f) invalidImage();
    const b1 = buffer[image.dataStart + 1];
    const b2 = buffer[image.dataStart + 2];
    const b3 = buffer[image.dataStart + 3];
    const b4 = buffer[image.dataStart + 4];
    const frameWidth = 1 + b1 + ((b2 & 0x3f) << 8);
    const frameHeight = 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10));
    verifyImageDimensions(frameWidth, frameHeight);
    if (extended && (width !== frameWidth || height !== frameHeight || alphaChunk)) invalidImage();
    width = frameWidth;
    height = frameHeight;
  }
  return { width, height, mime: 'image/webp' };
}

function verifyImage(buffer, contentType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16 || buffer.length > MAX_IMAGE_BYTES) invalidImage();
  if (contentType === 'image/png') return verifyPng(buffer);
  if (contentType === 'image/jpeg') return verifyJpeg(buffer);
  if (contentType === 'image/webp') return verifyWebp(buffer);
  return invalidImage();
}

function decodeHtmlEntities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return String(value || '').replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, name) => {
    if (name[0] !== '#') return Object.prototype.hasOwnProperty.call(named, name.toLowerCase()) ? named[name.toLowerCase()] : entity;
    const hexadecimal = name[1] && name[1].toLowerCase() === 'x';
    const number = Number.parseInt(name.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (!Number.isInteger(number) || number < 1 || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff)) return ' ';
    return String.fromCodePoint(number);
  });
}

function plainText(value) {
  const text = decodeHtmlEntities(String(value || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' '))
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(text).slice(0, 200).join('');
}

function tagAttributes(tag) {
  const attributes = Object.create(null);
  const expression = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = expression.exec(tag))) attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  return attributes;
}

function extractPageMetadata(body, contentType) {
  if (!['text/html', 'application/xhtml+xml'].includes(contentType)) return { title: null, imageUrl: '' };
  const html = new TextDecoder('utf-8', { fatal: false }).decode(body);
  const metas = html.match(/<meta\b[^>]*>/gi) || [];
  let title = null;
  let openGraphImage = '';
  let twitterImage = '';
  let imageTooLong = false;
  for (const tag of metas) {
    const attrs = tagAttributes(tag);
    const key = String(attrs.property || attrs.name || '').toLowerCase();
    if (!title && (key === 'og:title' || key === 'twitter:title')) {
      const value = plainText(attrs.content);
      if (value) title = { title: value, source: 'metadata' };
    }
    const image = decodeHtmlEntities(attrs.content || '').trim();
    if (key === 'og:image' && !openGraphImage && image) {
      if (image.length <= MAX_TARGET_URL_LENGTH) openGraphImage = image;
      else imageTooLong = true;
    }
    if (key === 'twitter:image' && !twitterImage && image) {
      if (image.length <= MAX_TARGET_URL_LENGTH) twitterImage = image;
      else imageTooLong = true;
    }
  }
  if (!title) {
    const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
    const value = titleTag && plainText(titleTag[1]);
    if (value) title = { title: value, source: 'document' };
  }
  return { title, imageUrl: openGraphImage || twitterImage, imageTooLong };
}

function imageFailureStatus(error) {
  if (error && ['invalid_url', 'blocked_destination', 'blocked_redirect', 'redirect_loop', 'image_redirect_limit'].includes(error.code)) return 'blocked';
  if (error && ['image_invalid', 'image_type', 'image_encoding', 'image_too_large'].includes(error.code)) return 'unsupported';
  if (error && ['image_timeout', 'dns_timeout', 'fetch_timeout'].includes(error.code)) return 'timeout';
  return 'unavailable';
}

async function fetchRemoteImage(rawImageUrl, documentUrl, deadline, signal) {
  let url;
  try { url = validateTargetUrl(rawImageUrl, documentUrl); }
  catch (error) { throw new HelperError(400, 'blocked_destination', error.message); }
  if (url.protocol !== 'https:') throw new HelperError(400, 'blocked_destination', 'Page images must use HTTPS.');
  const visited = new Set();
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    remainingTime(deadline);
    if (visited.has(url.href)) throw new HelperError(400, 'redirect_loop', 'The page image redirected repeatedly.');
    visited.add(url.href);
    const pinnedAddress = await resolvePublicTarget(url, deadline, signal);
    const response = await requestImage(url, pinnedAddress, deadline, signal);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectCount === MAX_REDIRECTS || typeof response.location !== 'string' || response.location.length > MAX_TARGET_URL_LENGTH) {
        throw new HelperError(502, 'image_redirect_limit', 'The page image redirected too many times.');
      }
      let next;
      try { next = validateTargetUrl(response.location, url); }
      catch (error) { throw new HelperError(502, 'blocked_redirect', error.message); }
      if (next.protocol !== 'https:') throw new HelperError(400, 'blocked_redirect', 'Page image redirects must remain on HTTPS.');
      url = next;
      continue;
    }
    const verified = verifyImage(response.body, response.contentType);
    return {
      thumbnail: 'data:' + verified.mime + ';base64,' + response.body.toString('base64'),
      imageHost: normalizedHostname(url)
    };
  }
  throw new HelperError(502, 'image_redirect_limit', 'The page image redirected too many times.');
}

async function fetchMetadata(rawUrl, includeThumbnail, signal) {
  const deadline = Date.now() + TOTAL_FETCH_TIMEOUT_MS;
  let url = validateTargetUrl(rawUrl);
  const visited = new Set();
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    remainingTime(deadline);
    if (visited.has(url.href)) throw new HelperError(400, 'redirect_loop', 'The page redirected repeatedly.');
    visited.add(url.href);
    const pinnedAddress = await resolvePublicTarget(url, deadline, signal);
    const response = await requestPage(url, pinnedAddress, deadline, signal);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectCount === MAX_REDIRECTS || typeof response.location !== 'string' || response.location.length > MAX_TARGET_URL_LENGTH) {
        throw new HelperError(502, 'redirect_limit', 'The page redirected too many times.');
      }
      let next;
      try { next = validateTargetUrl(response.location, url); }
      catch (error) { throw new HelperError(502, 'blocked_redirect', error.message); }
      if (url.protocol === 'https:' && next.protocol !== 'https:') throw new HelperError(400, 'blocked_redirect', 'Secure pages cannot redirect to an insecure page.');
      url = next;
      continue;
    }
    const pageMetadata = extractPageMetadata(response.body, response.contentType);
    const metadata = {
      title: pageMetadata.title ? pageMetadata.title.title : normalizedHostname(url),
      titleSource: pageMetadata.title ? pageMetadata.title.source : 'host-fallback',
      thumbnail: null,
      imageStatus: includeThumbnail ? (pageMetadata.imageUrl ? 'unavailable' : (pageMetadata.imageTooLong ? 'unsupported' : 'missing')) : 'not-requested'
    };
    if (includeThumbnail && pageMetadata.imageUrl) {
      try {
        const image = await fetchRemoteImage(pageMetadata.imageUrl, url, deadline, signal);
        metadata.thumbnail = image.thumbnail;
        metadata.imageHost = image.imageHost;
        metadata.imageStatus = 'fetched';
      } catch (error) {
        if (signal && signal.aborted) throw error;
        metadata.imageStatus = imageFailureStatus(error);
      }
    }
    return metadata;
  }
  throw new HelperError(502, 'redirect_limit', 'The page redirected too many times.');
}

function createMetadataServer(appOrigin, port) {
  const allowedHosts = expectedHostHeaders(port);
  let activeFetches = 0;
  function handler(request, response) {
    const host = String(request.headers.host || '').toLowerCase();
    if (!allowedHosts.has(host)) {
      jsonResponse(response, 403, { error: 'This local helper accepts loopback requests only.' });
      return;
    }
    if (request.url !== '/metadata') {
      jsonResponse(response, 404, { error: 'Endpoint not found.' });
      return;
    }
    const origin = request.headers.origin;
    if (origin !== appOrigin) {
      jsonResponse(response, 403, { error: 'This app origin is not allowed.' });
      return;
    }
    if (request.method === 'OPTIONS') {
      const requestedMethod = String(request.headers['access-control-request-method'] || '').toUpperCase();
      const requestedHeaders = String(request.headers['access-control-request-headers'] || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
      if (requestedMethod !== 'POST' || requestedHeaders.some((header) => header !== 'content-type')) {
        jsonResponse(response, 403, { error: 'This preflight request is not allowed.' });
        return;
      }
      response.writeHead(204, {
        'Access-Control-Allow-Origin': appOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        'Cache-Control': 'no-store',
        Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'
      });
      response.end();
      return;
    }
    if (request.method !== 'POST') {
      jsonResponse(response, 405, { error: 'Use POST for metadata requests.' }, appOrigin);
      return;
    }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(String(request.headers['content-type'] || ''))) {
      jsonResponse(response, 415, { error: 'Send metadata requests as application/json.' }, appOrigin);
      return;
    }
    if (activeFetches >= MAX_CONCURRENT_FETCHES) {
      jsonResponse(response, 429, { error: 'The metadata helper is busy. Try again shortly.' }, appOrigin);
      return;
    }
    activeFetches += 1;
    const corsOrigin = appOrigin;
    const controller = new AbortController();
    response.on('close', () => {
      if (!response.writableEnded) controller.abort();
    });
    readJsonBody(request).then((body) => {
      const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
      const validShape = keys.includes('url') && typeof body.url === 'string'
        && keys.every((key) => key === 'url' || key === 'includeThumbnail')
        && (!Object.prototype.hasOwnProperty.call(body, 'includeThumbnail') || typeof body.includeThumbnail === 'boolean');
      if (!validShape) {
        throw new HelperError(400, 'invalid_request', 'Send url and an optional boolean includeThumbnail field.');
      }
      return fetchMetadata(body.url, body.includeThumbnail === true, controller.signal);
    }).then((metadata) => {
      jsonResponse(response, 200, metadata, corsOrigin);
    }).catch((error) => {
      if (response.writableEnded || response.destroyed) return;
      const status = error instanceof HelperError ? error.status : 502;
      const code = error instanceof HelperError ? error.code : 'metadata_failed';
      const message = error instanceof HelperError ? error.message : 'Page metadata could not be read.';
      jsonResponse(response, status, { error: message, code }, corsOrigin);
    }).finally(() => { activeFetches = Math.max(0, activeFetches - 1); });
  }
  const server = createServer({ maxHeaderSize: 8192 }, handler);
  server.maxHeadersCount = 40;
  server.maxConnections = 16;
  server.headersTimeout = SERVER_HEADERS_TIMEOUT_MS;
  server.requestTimeout = SERVER_REQUEST_TIMEOUT_MS;
  server.keepAliveTimeout = 1_000;
  server.on('clientError', (_error, socket) => { try { socket.destroy(); } catch {} });
  return server.listen(port, '127.0.0.1');
}

function usage() {
  return 'Usage: node scripts/rich-link-metadata-helper.mjs --origin <exact-http(s)-app-origin> [--port <1024-65535>]';
}

function isDirectRun() {
  return !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

function main() {
  let options;
  try { options = parseArguments(process.argv.slice(2)); }
  catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(usage());
    return;
  }
  const server = createMetadataServer(options.origin, options.port);
  server.on('error', (error) => {
    console.error('Rich-link metadata helper could not start: ' + (error.code || 'server_error'));
    process.exitCode = 1;
  });
  server.on('listening', () => {
    console.log('Rich-link metadata helper listening at http://127.0.0.1:' + options.port + '/metadata for ' + options.origin);
  });
  process.on('SIGINT', () => server.close(() => { process.exitCode = 0; }));
  process.on('SIGTERM', () => server.close(() => { process.exitCode = 0; }));
}

if (isDirectRun()) main();
