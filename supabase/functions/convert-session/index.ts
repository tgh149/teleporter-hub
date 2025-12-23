import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SessionData {
  dc_id: number;
  auth_key: string;
  user_id?: number;
}

interface FileInput {
  name: string;
  data: string; // base64
  isZip?: boolean;
  zipContents?: { name: string; data: string }[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { files, sourceFormat, targetFormats, userId } = await req.json();
    
    console.log(`Converting ${files.length} files from ${sourceFormat} to ${targetFormats.join(', ')}`);
    
    const results: any[] = [];
    
    for (const file of files as FileInput[]) {
      // Handle ZIP files - extract and process contents
      if (file.isZip && file.zipContents) {
        console.log(`Processing ZIP file with ${file.zipContents.length} entries`);
        for (const zipEntry of file.zipContents) {
          await processFile(zipEntry, sourceFormat, targetFormats, results);
        }
      } else {
        await processFile(file, sourceFormat, targetFormats, results);
      }
    }
    
    console.log(`Conversion complete: ${results.length} files generated`);
    
    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Conversion error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processFile(
  file: { name: string; data: string },
  sourceFormat: string,
  targetFormats: string[],
  results: any[]
) {
  try {
    // Parse session based on source format
    const sessionData = parseSession(file.data, sourceFormat, file.name);
    
    if (!sessionData) {
      console.log(`Failed to parse ${file.name}`);
      return;
    }
    
    console.log(`Parsed ${file.name}: DC=${sessionData.dc_id}, AuthKey length=${sessionData.auth_key.length}`);
    
    // Convert to each target format
    for (const targetFormat of targetFormats) {
      const converted = convertToFormat(sessionData, targetFormat);
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const filename = `${baseName}_${targetFormat}${getExtension(targetFormat)}`;
      
      // For tdata format, we create proper structure
      if (targetFormat === 'desktop') {
        const tdataResult = createTdataFormat(sessionData, baseName);
        results.push({
          format: targetFormat,
          filename: `${baseName}_tdata.json`,
          data: btoa(JSON.stringify(tdataResult, null, 2)),
          size: JSON.stringify(tdataResult).length,
        });
      } else {
        results.push({
          format: targetFormat,
          filename,
          data: btoa(converted),
          size: converted.length,
        });
      }
    }
  } catch (e) {
    console.error(`Error processing ${file.name}:`, e);
  }
}

function parseSession(base64Data: string, format: string, filename: string): SessionData | null {
  try {
    const rawBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const data = new TextDecoder('utf-8', { fatal: false }).decode(rawBytes);
    
    console.log(`Parsing ${filename} as ${format}, size: ${rawBytes.length} bytes`);
    
    // Detect SQLite format (Telethon/Pyrogram .session files)
    if (rawBytes.length > 16 && data.startsWith('SQLite format 3')) {
      console.log('Detected SQLite session file');
      return parseSqliteSession(rawBytes);
    }
    
    if (format === 'telethon' || format === 'pyrogram') {
      // Try SQLite first
      if (data.startsWith('SQLite format 3')) {
        return parseSqliteSession(rawBytes);
      }
      // Try string session format (base64 encoded session string)
      return parseStringSession(base64Data);
    }
    
    if (format === 'desktop') {
      // Tdata format - binary format with key_datas
      return parseTdataFormat(rawBytes);
    }
    
    if (format === 'raw') {
      // Try to parse as DC_ID:AUTH_KEY format or raw auth key
      if (data.includes(':')) {
        const parts = data.split(':');
        if (parts.length >= 2) {
          const dcId = parseInt(parts[0].trim());
          const authKey = parts[1].trim();
          if (!isNaN(dcId) && dcId >= 1 && dcId <= 5 && authKey.length > 0) {
            return { dc_id: dcId, auth_key: authKey };
          }
        }
      }
      // Assume it's just an auth key with default DC
      const hexMatch = data.match(/[0-9a-fA-F]{256,512}/);
      if (hexMatch) {
        return { dc_id: 2, auth_key: hexMatch[0] };
      }
    }
    
    if (format === 'web' || format === 'json') {
      try {
        const json = JSON.parse(data);
        return {
          dc_id: json.dc_id || json.dcId || json.dc || 2,
          auth_key: json.auth_key || json.authKey || json.key || '',
          user_id: json.user_id || json.userId || json.id,
        };
      } catch {
        // Not valid JSON
      }
    }
    
    if (format === 'android' || format === 'android_x') {
      return parseAndroidSession(rawBytes);
    }
    
    // Fallback: try to extract any auth key pattern
    const hexPattern = /[0-9a-fA-F]{256,512}/g;
    const matches = data.match(hexPattern);
    if (matches && matches.length > 0) {
      return { dc_id: 2, auth_key: matches[0] };
    }
    
    return null;
  } catch (e) {
    console.error('Parse error:', e);
    return null;
  }
}

function parseSqliteSession(data: Uint8Array): SessionData | null {
  // SQLite session files store data in specific tables
  // We look for binary patterns that match session data
  try {
    const dataStr = new TextDecoder('utf-8', { fatal: false }).decode(data);
    
    // Look for DC ID (usually 1-5)
    let dcId = 2;
    
    // Look for patterns that might contain DC ID
    for (let i = 0; i < Math.min(data.length - 1, 1000); i++) {
      if (data[i] >= 1 && data[i] <= 5 && data[i + 1] === 0) {
        dcId = data[i];
        break;
      }
    }
    
    // Look for 256-byte auth key (usually after some header)
    let authKey = '';
    for (let i = 0; i < data.length - 256; i++) {
      // Auth keys usually have high entropy
      const slice = data.slice(i, i + 256);
      const entropy = calculateEntropy(slice);
      if (entropy > 7.0) { // High entropy indicates auth key
        authKey = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join('');
        break;
      }
    }
    
    if (authKey.length === 512) {
      return { dc_id: dcId, auth_key: authKey };
    }
    
    // Alternative: look for hex patterns
    const hexMatch = dataStr.match(/[0-9a-fA-F]{256,512}/);
    if (hexMatch) {
      return { dc_id: dcId, auth_key: hexMatch[0] };
    }
    
    return { dc_id: dcId, auth_key: '' };
  } catch (e) {
    console.error('SQLite parse error:', e);
    return null;
  }
}

function calculateEntropy(data: Uint8Array): number {
  const counts = new Map<number, number>();
  for (const byte of data) {
    counts.set(byte, (counts.get(byte) || 0) + 1);
  }
  
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / data.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function parseStringSession(base64Data: string): SessionData | null {
  try {
    // Telethon/Pyrogram string sessions are base64 encoded
    const decoded = atob(base64Data);
    const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
    
    if (bytes.length < 258) return null;
    
    const dcId = bytes[0];
    const authKey = Array.from(bytes.slice(1, 257))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return { dc_id: dcId, auth_key: authKey };
  } catch {
    return null;
  }
}

function parseTdataFormat(data: Uint8Array): SessionData | null {
  // Tdata is a complex binary format, extract what we can
  try {
    let dcId = 2;
    let authKey = '';
    
    // Look for DC ID byte
    for (let i = 0; i < Math.min(data.length, 100); i++) {
      if (data[i] >= 1 && data[i] <= 5) {
        dcId = data[i];
        break;
      }
    }
    
    // Look for auth key (256 bytes of high entropy)
    for (let i = 0; i < data.length - 256; i++) {
      const slice = data.slice(i, i + 256);
      if (calculateEntropy(slice) > 7.0) {
        authKey = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join('');
        break;
      }
    }
    
    return { dc_id: dcId, auth_key: authKey };
  } catch {
    return null;
  }
}

function parseAndroidSession(data: Uint8Array): SessionData | null {
  // Android session format
  try {
    // Skip header bytes and look for session data
    let dcId = 2;
    let authKey = '';
    
    // Android sessions have DC ID near the beginning
    for (let i = 0; i < Math.min(data.length, 50); i++) {
      if (data[i] >= 1 && data[i] <= 5) {
        dcId = data[i];
        break;
      }
    }
    
    // Look for auth key
    for (let i = 0; i < data.length - 256; i++) {
      const slice = data.slice(i, i + 256);
      if (calculateEntropy(slice) > 7.0) {
        authKey = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join('');
        break;
      }
    }
    
    return { dc_id: dcId, auth_key: authKey };
  } catch {
    return null;
  }
}

function convertToFormat(session: SessionData, format: string): string {
  switch (format) {
    case 'raw':
      return `${session.dc_id}:${session.auth_key}`;
    
    case 'web':
    case 'json':
      return JSON.stringify({
        dc_id: session.dc_id,
        auth_key: session.auth_key,
        user_id: session.user_id || null,
      }, null, 2);
    
    case 'telethon':
      // Telethon string session format: base64(dc_id + auth_key_bytes)
      return createTelethonSession(session);
    
    case 'pyrogram':
      // Pyrogram string session format (similar to telethon)
      return createPyrogramSession(session);
    
    case 'android':
    case 'android_x':
      return `${session.dc_id}:${session.auth_key}`;
    
    default:
      return `${session.dc_id}:${session.auth_key}`;
  }
}

function createTelethonSession(session: SessionData): string {
  // Create Telethon string session
  const authKeyBytes = hexToBytes(session.auth_key);
  if (authKeyBytes.length !== 256) {
    return `1${btoa(String.fromCharCode(session.dc_id) + session.auth_key.slice(0, 500))}`;
  }
  
  const bytes = new Uint8Array(257);
  bytes[0] = session.dc_id;
  bytes.set(authKeyBytes, 1);
  
  return '1' + btoa(String.fromCharCode(...bytes));
}

function createPyrogramSession(session: SessionData): string {
  // Pyrogram string session is similar
  return createTelethonSession(session);
}

function createTdataFormat(session: SessionData, baseName: string): object {
  // Create a JSON representation of tdata structure
  // (actual tdata is binary, this is a readable version)
  return {
    format: 'tdata_info',
    note: 'This is a JSON representation. Use desktop client to import.',
    session: {
      dc_id: session.dc_id,
      auth_key: session.auth_key,
      user_id: session.user_id,
    },
    structure: {
      folder: `${baseName}/tdata`,
      files: [
        'key_datas',
        `D877F783D5D3EF8C`,
        `D877F783D5D3EF8Cs`,
        `D877F783D5D3EF8C/maps`,
      ],
    },
  };
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    hex = hex.slice(0, -1);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  return bytes;
}

function getExtension(format: string): string {
  const extensions: Record<string, string> = {
    android: '.session',
    android_x: '.session',
    desktop: '.tdata',
    web: '.json',
    telethon: '.session',
    pyrogram: '.session',
    raw: '.txt',
    json: '.json',
  };
  return extensions[format] || '.txt';
}
