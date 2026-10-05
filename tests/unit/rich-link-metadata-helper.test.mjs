import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { verifyImage } from '../../scripts/rich-link-metadata-helper.mjs';

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(name, payload = Buffer.alloc(0)) {
  const type = Buffer.isBuffer(name) ? name : Buffer.from(name, 'latin1');
  const result = Buffer.alloc(payload.length + 12);
  result.writeUInt32BE(payload.length, 0);
  type.copy(result, 4);
  payload.copy(result, 8);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([type, payload])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

function png({ colorType = 2, beforeData = [], afterData = [] } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = colorType;
  // One non-interlaced red pixel, with a valid filter byte and zlib stream.
  const pixels = colorType === 3 ? Buffer.from([0, 0]) : Buffer.from([0, 255, 0, 0]);
  return Buffer.concat([
    signature, chunk('IHDR', header), ...beforeData,
    chunk('IDAT', deflateSync(pixels)), ...afterData, chunk('IEND')
  ]);
}

function inspect(buffer) {
  return verifyImage(buffer, 'image/png');
}

function assertInvalid(buffer) {
  assert.throws(() => inspect(buffer), (error) => error && error.code === 'image_invalid');
}

test('PNG control and explicitly allowed sRGB ancillary chunk are accepted', () => {
  const expected = { width: 1, height: 1, mime: 'image/png' };
  assert.deepEqual(inspect(png()), expected);
  assert.deepEqual(inspect(png({ beforeData: [chunk('sRGB', Buffer.from([0]))] })), expected);
});

test('PNG truecolor and indexed-color transparency chunks are accepted', () => {
  const transparentRed = Buffer.from([0, 255, 0, 0, 0, 0]);
  assert.deepEqual(inspect(png({ beforeData: [chunk('tRNS', transparentRed)] })),
    { width: 1, height: 1, mime: 'image/png' });
  assert.deepEqual(inspect(png({ colorType: 3, beforeData: [
    chunk('PLTE', Buffer.from([255, 0, 0])), chunk('tRNS', Buffer.from([0]))
  ] })), { width: 1, height: 1, mime: 'image/png' });
});

test('PNG chunk names remain explicitly allowlisted and require ASCII letters with uppercase reserved letter', () => {
  assertInvalid(png({ beforeData: [chunk('tEXt', Buffer.from('Comment\0not accepted'))] }));
  assertInvalid(png({ beforeData: [chunk('srgb', Buffer.from([0]))] }));
  assertInvalid(png({ beforeData: [chunk('sR1B', Buffer.from([0]))] }));
  const highBitName = Buffer.from('sRGB');
  highBitName[0] |= 0x80;
  assertInvalid(png({ beforeData: [chunk(highBitName, Buffer.from([0]))] }));
});

test('PNG ancillary acceptance retains CRC, payload-length, and pre-image ordering checks', () => {
  const badCrc = chunk('sRGB', Buffer.from([0]));
  badCrc[badCrc.length - 1] ^= 1;
  assertInvalid(png({ beforeData: [badCrc] }));
  assertInvalid(png({ beforeData: [chunk('sRGB', Buffer.from([0, 0]))] }));
  assertInvalid(png({ afterData: [chunk('sRGB', Buffer.from([0]))] }));
  const beforeHeader = Buffer.concat([signature, chunk('sRGB', Buffer.from([0])), png().subarray(signature.length)]);
  assertInvalid(beforeHeader);
});
