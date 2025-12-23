import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SessionData {
  dc_id: number;
  auth_key: Uint8Array;
  user_id?: number;
}

interface FileInput {
  name: string;
  data: string; // base64
  isZip?: boolean;
  zipContents?: { name: string; data: string }[];
}

interface TdataFile {
  path: string;
  data: string; // base64
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
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      
      // For tdata format, create proper structure with multiple files
      if (targetFormat === 'desktop') {
        const tdataFiles = createTdataFiles(sessionData, baseName);
        
        // Return tdata as a JSON structure that frontend can zip
        results.push({
          format: targetFormat,
          filename: `${baseName}_tdata.zip`,
          data: btoa(JSON.stringify({ files: tdataFiles, baseName })),
          size: 0,
          isTdata: true,
        });
      } else {
        const converted = convertToFormat(sessionData, targetFormat);
        const filename = `${baseName}_${targetFormat}${getExtension(targetFormat)}`;
        
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
      if (data.startsWith('SQLite format 3')) {
        return parseSqliteSession(rawBytes);
      }
      return parseStringSession(base64Data);
    }
    
    if (format === 'desktop') {
      return parseTdataFormat(rawBytes);
    }
    
    if (format === 'raw') {
      if (data.includes(':')) {
        const parts = data.split(':');
        if (parts.length >= 2) {
          const dcId = parseInt(parts[0].trim());
          const authKeyHex = parts[1].trim();
          if (!isNaN(dcId) && dcId >= 1 && dcId <= 5 && authKeyHex.length > 0) {
            return { dc_id: dcId, auth_key: hexToBytes(authKeyHex) };
          }
        }
      }
      const hexMatch = data.match(/[0-9a-fA-F]{256,512}/);
      if (hexMatch) {
        return { dc_id: 2, auth_key: hexToBytes(hexMatch[0]) };
      }
    }
    
    if (format === 'web' || format === 'json') {
      try {
        const json = JSON.parse(data);
        const authKey = json.auth_key || json.authKey || json.key || '';
        return {
          dc_id: json.dc_id || json.dcId || json.dc || 2,
          auth_key: typeof authKey === 'string' ? hexToBytes(authKey) : new Uint8Array(authKey),
          user_id: json.user_id || json.userId || json.id,
        };
      } catch {
        // Not valid JSON
      }
    }
    
    if (format === 'android' || format === 'android_x') {
      return parseAndroidSession(rawBytes);
    }
    
    // Fallback: try to find auth key
    const authKey = findAuthKey(rawBytes);
    if (authKey) {
      return { dc_id: 2, auth_key: authKey };
    }
    
    return null;
  } catch (e) {
    console.error('Parse error:', e);
    return null;
  }
}

function parseSqliteSession(data: Uint8Array): SessionData | null {
  try {
    let dcId = 2;
    
    for (let i = 0; i < Math.min(data.length - 1, 1000); i++) {
      if (data[i] >= 1 && data[i] <= 5 && data[i + 1] === 0) {
        dcId = data[i];
        break;
      }
    }
    
    const authKey = findAuthKey(data);
    
    if (authKey && authKey.length === 256) {
      return { dc_id: dcId, auth_key: authKey };
    }
    
    return { dc_id: dcId, auth_key: new Uint8Array(256) };
  } catch (e) {
    console.error('SQLite parse error:', e);
    return null;
  }
}

function findAuthKey(data: Uint8Array): Uint8Array | null {
  for (let i = 0; i < data.length - 256; i++) {
    const slice = data.slice(i, i + 256);
    const entropy = calculateEntropy(slice);
    if (entropy > 7.0) {
      return slice;
    }
  }
  return null;
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
    const decoded = atob(base64Data);
    const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
    
    if (bytes.length < 258) return null;
    
    const dcId = bytes[0];
    const authKey = bytes.slice(1, 257);
    
    return { dc_id: dcId, auth_key: authKey };
  } catch {
    return null;
  }
}

function parseTdataFormat(data: Uint8Array): SessionData | null {
  try {
    let dcId = 2;
    
    for (let i = 0; i < Math.min(data.length, 100); i++) {
      if (data[i] >= 1 && data[i] <= 5) {
        dcId = data[i];
        break;
      }
    }
    
    const authKey = findAuthKey(data);
    
    return { dc_id: dcId, auth_key: authKey || new Uint8Array(256) };
  } catch {
    return null;
  }
}

function parseAndroidSession(data: Uint8Array): SessionData | null {
  try {
    let dcId = 2;
    
    for (let i = 0; i < Math.min(data.length, 50); i++) {
      if (data[i] >= 1 && data[i] <= 5) {
        dcId = data[i];
        break;
      }
    }
    
    const authKey = findAuthKey(data);
    
    return { dc_id: dcId, auth_key: authKey || new Uint8Array(256) };
  } catch {
    return null;
  }
}

function convertToFormat(session: SessionData, format: string): string {
  const authKeyHex = bytesToHex(session.auth_key);
  
  switch (format) {
    case 'raw':
      return `${session.dc_id}:${authKeyHex}`;
    
    case 'web':
    case 'json':
      return JSON.stringify({
        dc_id: session.dc_id,
        auth_key: authKeyHex,
        user_id: session.user_id || null,
      }, null, 2);
    
    case 'telethon':
      return createTelethonSession(session);
    
    case 'pyrogram':
      return createPyrogramSession(session);
    
    case 'android':
    case 'android_x':
      return `${session.dc_id}:${authKeyHex}`;
    
    default:
      return `${session.dc_id}:${authKeyHex}`;
  }
}

function createTelethonSession(session: SessionData): string {
  if (session.auth_key.length !== 256) {
    return `1${btoa(String.fromCharCode(session.dc_id) + bytesToHex(session.auth_key).slice(0, 500))}`;
  }
  
  const bytes = new Uint8Array(257);
  bytes[0] = session.dc_id;
  bytes.set(session.auth_key, 1);
  
  return '1' + btoa(String.fromCharCode(...bytes));
}

function createPyrogramSession(session: SessionData): string {
  return createTelethonSession(session);
}

// Create tdata file structure as array of files with paths and base64 content
function createTdataFiles(session: SessionData, baseName: string): TdataFile[] {
  const keyId = generateKeyId();
  const files: TdataFile[] = [];
  
  // key_datas file
  const keyDatas = createKeyDatasFile(session);
  files.push({
    path: `${baseName}/tdata/key_datas`,
    data: btoa(String.fromCharCode(...keyDatas)),
  });
  
  // DC key file (e.g., D877F783D5D3EF8C)
  const dcKey = createDcKeyFile(session);
  files.push({
    path: `${baseName}/tdata/${keyId}`,
    data: btoa(String.fromCharCode(...dcKey)),
  });
  
  // DC key file with 's' suffix
  const dcKeyS = createDcKeyFileS(session);
  files.push({
    path: `${baseName}/tdata/${keyId}s`,
    data: btoa(String.fromCharCode(...dcKeyS)),
  });
  
  // maps file in subfolder
  const maps = createMapsFile(session, keyId);
  files.push({
    path: `${baseName}/tdata/${keyId}/maps`,
    data: btoa(String.fromCharCode(...maps)),
  });
  
  return files;
}

function generateKeyId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
}

function createKeyDatasFile(session: SessionData): Uint8Array {
  const buffer = new ArrayBuffer(388);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  
  // TDesktop magic
  view.setUint32(0, 0x544446, false);
  view.setUint32(4, 380, false);
  
  // Salt
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  bytes.set(salt, 8);
  
  view.setUint32(40, session.dc_id, false);
  bytes.set(session.auth_key.slice(0, 256), 44);
  
  if (session.user_id) {
    view.setBigUint64(300, BigInt(session.user_id), false);
  }
  
  return bytes;
}

function createDcKeyFile(session: SessionData): Uint8Array {
  const buffer = new ArrayBuffer(348);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  
  view.setUint32(0, 0x02, false);
  view.setUint32(4, session.dc_id, false);
  view.setUint32(8, 0x01, false);
  bytes.set(session.auth_key.slice(0, 256), 12);
  
  const authKeyId = session.auth_key.slice(248, 256);
  bytes.set(authKeyId, 268);
  
  if (session.user_id) {
    view.setBigUint64(276, BigInt(session.user_id), false);
  }
  
  return bytes;
}

function createDcKeyFileS(session: SessionData): Uint8Array {
  const buffer = new ArrayBuffer(348);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  
  view.setUint32(0, 0x02, false);
  view.setUint32(4, session.dc_id, false);
  view.setUint32(8, 0x01, false);
  bytes.set(session.auth_key.slice(0, 256), 12);
  
  return bytes;
}

function createMapsFile(session: SessionData, keyId: string): Uint8Array {
  const buffer = new ArrayBuffer(68);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  
  view.setUint32(0, 0x01, false);
  view.setUint32(4, session.dc_id, false);
  
  const keyIdBytes = hexToBytes(keyId);
  bytes.set(keyIdBytes, 8);
  
  return bytes;
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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getExtension(format: string): string {
  const extensions: Record<string, string> = {
    android: '.session',
    android_x: '.session',
    desktop: '.zip',
    web: '.json',
    telethon: '.session',
    pyrogram: '.session',
    raw: '.txt',
    json: '.json',
  };
  return extensions[format] || '.txt';
}
