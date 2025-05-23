import {
  base64StringToStream,
  cacheByReturn,
  caniuse,
  streamToBase64String,
  streamToString,
  stringToStream,
} from '@cmtlyt/base';

import { unzipSync, zipSync } from './dict-zip';

const caniuseGip = cacheByReturn(() => {
  return (
    caniuse('TextEncoder')
    && caniuse('ReadableStream')
    && caniuse('ArrayBuffer')
    && caniuse('Uint8Array')
    && caniuse('btoa')
    && caniuse('atob')
    && caniuse('TextDecoder')
  );
});

// TODO 提供对 node 环境的支持
export async function gzip(source: string, keyLength: number = 6) {
  if (!caniuse('CompressionStream') || !caniuseGip())
    return zipSync(source, keyLength);

  const compressedStream = stringToStream(source).pipeThrough(new CompressionStream('gzip'));

  return streamToBase64String(compressedStream);
}

// TODO 提供对 node 环境的支持
export async function unGzip(zipSource: string) {
  if (!caniuse('DecompressionStream') || !caniuseGip())
    return unzipSync(zipSource);

  const stream = base64StringToStream(zipSource);
  const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));

  return streamToString(decompressedStream);
}
