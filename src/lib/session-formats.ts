// Session format definitions based on the teleporter library
export const SESSION_FORMATS = {
  android: {
    id: 'android',
    name: 'Android',
    description: 'Telegram Android client session',
    extension: '.session',
  },
  android_x: {
    id: 'android_x',
    name: 'Android X',
    description: 'Telegram Android X client session',
    extension: '.session',
  },
  desktop: {
    id: 'desktop',
    name: 'Desktop',
    description: 'Telegram Desktop client session',
    extension: '.tdata',
  },
  web: {
    id: 'web',
    name: 'Web',
    description: 'Telegram Web session (localStorage)',
    extension: '.json',
  },
  telethon: {
    id: 'telethon',
    name: 'Telethon',
    description: 'Telethon Python library session',
    extension: '.session',
  },
  pyrogram: {
    id: 'pyrogram',
    name: 'Pyrogram',
    description: 'Pyrogram Python library session',
    extension: '.session',
  },
  raw: {
    id: 'raw',
    name: 'Raw',
    description: 'Raw session data (DC ID + Auth Key)',
    extension: '.txt',
  },
} as const;

export type SessionFormat = keyof typeof SESSION_FORMATS;

export interface SessionData {
  dc_id: number;
  auth_key: string;
  user_id?: number;
  is_bot?: boolean;
  api_id?: number;
  test_mode?: boolean;
  format?: SessionFormat;
}

export interface ConversionResult {
  format: SessionFormat;
  filename: string;
  data: string; // base64 encoded
  size: number;
}

// Detect format from file content/extension
export function detectFormat(filename: string, content?: string): SessionFormat | null {
  const ext = filename.toLowerCase().split('.').pop();
  
  // Check by extension first
  if (ext === 'json') {
    return 'web';
  }
  
  if (filename.includes('tdata') || ext === 'tdata') {
    return 'desktop';
  }
  
  if (ext === 'session') {
    // Could be android, android_x, telethon, or pyrogram
    // Would need to inspect content to differentiate
    return 'telethon'; // Default assumption for .session files
  }
  
  if (ext === 'txt') {
    return 'raw';
  }
  
  return null;
}

// Validate session data structure
export function validateSessionData(data: Partial<SessionData>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.dc_id || data.dc_id < 1 || data.dc_id > 5) {
    errors.push('DC ID must be between 1 and 5');
  }
  
  if (!data.auth_key) {
    errors.push('Auth key is required');
  } else if (data.auth_key.length !== 512) {
    errors.push('Auth key must be 256 bytes (512 hex characters)');
  } else if (!/^[0-9a-fA-F]+$/.test(data.auth_key)) {
    errors.push('Auth key must be a valid hex string');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// Mask auth key for display
export function maskAuthKey(authKey: string, showChars = 16): string {
  if (authKey.length <= showChars * 2) {
    return authKey;
  }
  const start = authKey.slice(0, showChars);
  const end = authKey.slice(-showChars);
  return `${start}...${end}`;
}
