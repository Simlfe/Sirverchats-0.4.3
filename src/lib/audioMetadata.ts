export interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  displayName: string;
  originalFilename: string;
}

/**
 * Clean up raw filenames by removing random hashes/UUIDs/timestamps if present.
 */
export function cleanFilename(filename: string): string {
  if (!filename) return 'Audio Track';
  // Remove file path if full path passed
  const nameOnly = filename.split(/[/\\]/).pop() || filename;
  // Remove extension
  const withoutExt = nameOnly.replace(/\.[a-zA-Z0-9]+$/i, '');
  // Remove random prefix like att_123456_ or 1712345678_
  let cleaned = withoutExt
    .replace(/^att_[a-z0-9]+_\d+_/i, '')
    .replace(/^\d{10,}_/i, '')
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, '')
    // Remove PocketBase random 8-15 character hash suffix
    .replace(/[-_ ][a-zA-Z0-9]{8,15}$/i, '')
    .replace(/_/g, ' ')
    .trim();

  // Remove leftover trailing hash if separated by space (e.g., "01 the search HK51WikltV")
  cleaned = cleaned.replace(/\s+[a-zA-Z0-9]{8,15}$/i, '').trim();

  return cleaned || withoutExt || nameOnly;
}

/**
 * Parse FLAC METADATA_BLOCK_PICTURE body bytes into a cover Object URL.
 */
function parseFlacPictureBlock(body: Uint8Array): string | undefined {
  try {
    if (body.length < 32) return undefined;
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);

    // 4 bytes: picture type
    // 4 bytes: mime length
    const mimeLen = view.getUint32(4);
    if (8 + mimeLen > body.length) return undefined;

    const mimeDecoder = new TextDecoder('ascii');
    let mimeType = mimeDecoder.decode(body.subarray(8, 8 + mimeLen)).trim();
    if (!mimeType || mimeType === 'image/') mimeType = 'image/jpeg';

    // 4 bytes: desc length
    const descOffset = 8 + mimeLen;
    const descLen = view.getUint32(descOffset);

    // 16 bytes: width, height, depth, colors
    const dataLenOffset = descOffset + 4 + descLen + 16;
    if (dataLenOffset + 4 > body.length) return undefined;

    const dataLen = view.getUint32(dataLenOffset);
    const imgDataOffset = dataLenOffset + 4;

    if (imgDataOffset + dataLen <= body.length && dataLen > 0) {
      const imgBytes = body.subarray(imgDataOffset, imgDataOffset + dataLen);
      const blob = new Blob([imgBytes], { type: mimeType });
      return URL.createObjectURL(blob);
    }
  } catch (e) {
    console.warn('[AudioMetadata] Error parsing FLAC picture block:', e);
  }
  return undefined;
}

/**
 * Extract audio ID3 / embedded metadata and album art picture from File.
 */
export async function extractAudioMetadata(file: File | Blob, filenameOverride?: string): Promise<AudioMetadata> {
  const originalFilename = filenameOverride || (file as File).name || 'audio.mp3';
  let title: string | undefined;
  let artist: string | undefined;
  let album: string | undefined;
  let coverUrl: string | undefined;

  try {
    // Read up to 512KB for initial metadata and picture frames
    const headerSlice = file.slice(0, Math.min(524288, file.size));
    const headerBuf = await headerSlice.arrayBuffer();
    const bytes = new Uint8Array(headerBuf);

    // 1. Check ID3v2 tags (MP3 / AAC / WAV)
    if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) { // "ID3"
      const version = bytes[3];
      const tagSize = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
      let offset = 10;
      const maxOffset = Math.min(bytes.length, 10 + tagSize);

      while (offset < maxOffset - 10) {
        let frameId = '';
        let frameSize = 0;

        if (version === 2) {
          // ID3v2.2
          frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2]);
          frameSize = (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5];
          offset += 6;
        } else {
          // ID3v2.3 or ID3v2.4
          frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
          if (version === 4) {
            frameSize = ((bytes[offset + 4] & 0x7f) << 21) | ((bytes[offset + 5] & 0x7f) << 14) | ((bytes[offset + 6] & 0x7f) << 7) | (bytes[offset + 7] & 0x7f);
          } else {
            frameSize = (bytes[offset + 4] << 24) | (bytes[offset + 5] << 16) | (bytes[offset + 6] << 8) | bytes[offset + 7];
          }
          offset += 10;
        }

        if (!frameId || frameId.charCodeAt(0) === 0 || frameSize <= 0 || offset + frameSize > maxOffset) {
          break;
        }

        const frameBytes = bytes.subarray(offset, offset + frameSize);
        offset += frameSize;

        // Decode text frames
        if (['TIT2', 'TT2', 'TPE1', 'TP1', 'TALB', 'TAL'].includes(frameId)) {
          const encoding = frameBytes[0];
          let str = '';
          const textData = frameBytes.subarray(1);

          if (encoding === 1 || encoding === 2) {
            const decoder = new TextDecoder(encoding === 1 ? 'utf-16' : 'utf-16be');
            str = decoder.decode(textData);
          } else if (encoding === 3) {
            const decoder = new TextDecoder('utf-8');
            str = decoder.decode(textData);
          } else {
            const decoder = new TextDecoder('iso-8859-1');
            str = decoder.decode(textData);
          }
          str = str.replace(/\0/g, '').trim();

          if (str) {
            if (frameId === 'TIT2' || frameId === 'TT2') title = str;
            if (frameId === 'TPE1' || frameId === 'TP1') artist = str;
            if (frameId === 'TALB' || frameId === 'TAL') album = str;
          }
        }

        // Decode ID3 APIC / PIC cover art frame
        if (!coverUrl && (frameId === 'APIC' || frameId === 'PIC')) {
          try {
            const encoding = frameBytes[0];
            let mimeType = 'image/jpeg';
            let imgStart = 1;

            if (frameId === 'PIC') { // ID3v2.2 (3-char format like JPG/PNG)
              const fmt = String.fromCharCode(frameBytes[1], frameBytes[2], frameBytes[3]).toLowerCase();
              mimeType = fmt === 'png' ? 'image/png' : 'image/jpeg';
              imgStart = 5; // encoding(1) + fmt(3) + pictureType(1)
            } else { // ID3v2.3 / ID3v2.4 APIC
              // Read null-terminated MIME type string
              let nullIdx = 1;
              while (nullIdx < frameBytes.length && frameBytes[nullIdx] !== 0) {
                nullIdx++;
              }
              const rawMime = new TextDecoder('ascii').decode(frameBytes.subarray(1, nullIdx)).trim();
              if (rawMime && rawMime.includes('/')) {
                mimeType = rawMime;
              }
              const pTypeIdx = nullIdx + 1; // Picture type byte
              let descStart = pTypeIdx + 1;

              // Skip description string
              if (encoding === 1 || encoding === 2) {
                // UTF-16 double null terminated
                while (descStart < frameBytes.length - 1 && !(frameBytes[descStart] === 0 && frameBytes[descStart + 1] === 0)) {
                  descStart++;
                }
                descStart += 2;
              } else {
                // Single null terminated
                while (descStart < frameBytes.length && frameBytes[descStart] !== 0) {
                  descStart++;
                }
                descStart += 1;
              }
              imgStart = descStart;
            }

            if (imgStart < frameBytes.length) {
              const imgData = frameBytes.subarray(imgStart);
              if (imgData.length > 0) {
                const blob = new Blob([imgData], { type: mimeType });
                coverUrl = URL.createObjectURL(blob);
              }
            }
          } catch (picErr) {
            console.warn('[AudioMetadata] Error parsing APIC frame:', picErr);
          }
        }
      }
    }

    // 2. Check FLAC native blocks ("fLaC" header: 0x66 0x4C 0x61 0x43)
    if (bytes.length >= 8 && bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43) {
      let fOffset = 4;
      while (fOffset < bytes.length - 4) {
        const headerByte = bytes[fOffset];
        const isLast = (headerByte & 0x80) !== 0;
        const blockType = headerByte & 0x7F;
        const blockLen = (bytes[fOffset + 1] << 16) | (bytes[fOffset + 2] << 8) | bytes[fOffset + 3];
        fOffset += 4;

        if (fOffset + blockLen > bytes.length) break;

        const blockBody = bytes.subarray(fOffset, fOffset + blockLen);

        // Block type 6 = PICTURE
        if (blockType === 6 && !coverUrl) {
          const parsedCover = parseFlacPictureBlock(blockBody);
          if (parsedCover) coverUrl = parsedCover;
        }

        // Block type 4 = VORBIS_COMMENT
        if (blockType === 4 && (!title || !artist || !coverUrl)) {
          try {
            const dec = new TextDecoder('utf-8', { fatal: false });
            const vorbisTxt = dec.decode(blockBody);

            if (!title) {
              const m = vorbisTxt.match(/TITLE=([^\x00-\x1F\x7F]+)/i);
              if (m?.[1]) title = m[1].trim();
            }
            if (!artist) {
              const m = vorbisTxt.match(/ARTIST=([^\x00-\x1F\x7F]+)/i);
              if (m?.[1]) artist = m[1].trim();
            }
            if (!album) {
              const m = vorbisTxt.match(/ALBUM=([^\x00-\x1F\x7F]+)/i);
              if (m?.[1]) album = m[1].trim();
            }

            if (!coverUrl) {
              const picMatch = vorbisTxt.match(/METADATA_BLOCK_PICTURE=([A-Za-z0-9+/=]+)/i);
              if (picMatch?.[1]) {
                const rawB64 = picMatch[1].trim();
                const binaryStr = atob(rawB64);
                const picBytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                  picBytes[i] = binaryStr.charCodeAt(i);
                }
                const parsed = parseFlacPictureBlock(picBytes);
                if (parsed) coverUrl = parsed;
              }
            }
          } catch (e) {}
        }

        fOffset += blockLen;
        if (isLast) break;
      }
    }

    // 3. Try ID3v1 tags at end of file if no ID3v2 title
    if (!title && file.size >= 128) {
      const v1Slice = file.slice(file.size - 128);
      const v1Buf = await v1Slice.arrayBuffer();
      const v1Bytes = new Uint8Array(v1Buf);
      if (v1Bytes[0] === 0x54 && v1Bytes[1] === 0x41 && v1Bytes[2] === 0x47) { // "TAG"
        const decoder = new TextDecoder('iso-8859-1');
        const v1Title = decoder.decode(v1Bytes.subarray(3, 33)).replace(/\0/g, '').trim();
        const v1Artist = decoder.decode(v1Bytes.subarray(33, 63)).replace(/\0/g, '').trim();
        const v1Album = decoder.decode(v1Bytes.subarray(63, 93)).replace(/\0/g, '').trim();
        if (v1Title) title = v1Title;
        if (v1Artist && !artist) artist = v1Artist;
        if (v1Album && !album) album = v1Album;
      }
    }

    // 4. Fallback text scan for OGG / Vorbis / M4A if still no title or cover
    if (!title || !coverUrl) {
      const dec = new TextDecoder('utf-8', { fatal: false });
      const text = dec.decode(bytes);

      if (!title) {
        const titleMatch = text.match(/TITLE=([^\x00-\x1F\x7F]+)/i);
        if (titleMatch?.[1]) title = titleMatch[1].trim();
      }
      if (!artist) {
        const artistMatch = text.match(/ARTIST=([^\x00-\x1F\x7F]+)/i);
        if (artistMatch?.[1]) artist = artistMatch[1].trim();
      }
      if (!album) {
        const albumMatch = text.match(/ALBUM=([^\x00-\x1F\x7F]+)/i);
        if (albumMatch?.[1]) album = albumMatch[1].trim();
      }

      if (!coverUrl) {
        const picMatch = text.match(/METADATA_BLOCK_PICTURE=([A-Za-z0-9+/=]+)/i);
        if (picMatch?.[1]) {
          try {
            const rawB64 = picMatch[1].trim();
            const binaryStr = atob(rawB64);
            const picBytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              picBytes[i] = binaryStr.charCodeAt(i);
            }
            const parsed = parseFlacPictureBlock(picBytes);
            if (parsed) coverUrl = parsed;
          } catch (e) {}
        }
      }
    }
  } catch (err) {
    console.warn('[AudioMetadata] Failed to extract metadata:', err);
  }

  // Fallback to filename parsing
  const cleanedName = cleanFilename(originalFilename);
  if (!title) {
    if (cleanedName.includes(' - ')) {
      const parts = cleanedName.split(' - ');
      if (!artist) artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    } else {
      title = cleanedName;
    }
  }

  let displayName = title;
  if (artist && title && !title.toLowerCase().includes(artist.toLowerCase())) {
    displayName = `${artist} - ${title}`;
  }

  return {
    title,
    artist,
    album,
    coverUrl,
    displayName,
    originalFilename
  };
}

/**
 * Fetch initial bytes of an audio URL to extract embedded cover art picture if available.
 */
export async function extractCoverFromUrl(url: string): Promise<string | undefined> {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return undefined;
  try {
    const resp = await fetch(url, { headers: { Range: 'bytes=0-262143' } });
    if (!resp.ok && resp.status !== 206) return undefined;
    const blob = await resp.blob();
    const meta = await extractAudioMetadata(blob, 'remote.mp3');
    return meta.coverUrl;
  } catch (e) {
    console.warn('[AudioMetadata] Failed to fetch cover from URL:', e);
  }
  return undefined;
}

