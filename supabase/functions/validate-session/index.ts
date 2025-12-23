import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { filename, data, rawData } = await req.json();
    
    let session: any = null;
    const errors: string[] = [];
    
    if (rawData) {
      session = parseRawInput(rawData, errors);
    } else if (data) {
      session = parseFileData(atob(data), filename, errors);
    }
    
    if (errors.length > 0) {
      return new Response(JSON.stringify({ valid: false, errors }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Validate session data
    const validation = validateSession(session);
    if (!validation.valid) {
      return new Response(JSON.stringify({ valid: false, errors: validation.errors }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ valid: true, session }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Validation error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ valid: false, errors: [message] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function parseRawInput(input: string, errors: string[]): any {
  const trimmed = input.trim();
  
  // Try DC_ID:AUTH_KEY format
  if (trimmed.includes(':')) {
    const [dcPart, authPart] = trimmed.split(':');
    const dcId = parseInt(dcPart);
    if (!isNaN(dcId) && authPart) {
      return { dc_id: dcId, auth_key: authPart.trim(), format: 'raw' };
    }
  }
  
  // Try JSON format
  try {
    const json = JSON.parse(trimmed);
    return {
      dc_id: json.dc_id || json.dcId || 2,
      auth_key: json.auth_key || json.authKey || '',
      user_id: json.user_id || json.userId,
      format: 'web',
    };
  } catch {}
  
  // Assume raw auth key
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === 512) {
    return { dc_id: 2, auth_key: trimmed, format: 'raw' };
  }
  
  errors.push('Unable to parse session data. Expected DC_ID:AUTH_KEY format, JSON, or hex auth key.');
  return null;
}

function parseFileData(data: string, filename: string, errors: string[]): any {
  const ext = filename?.toLowerCase().split('.').pop();
  
  if (ext === 'json') {
    try {
      const json = JSON.parse(data);
      return {
        dc_id: json.dc_id || json.dcId || 2,
        auth_key: json.auth_key || json.authKey || '',
        user_id: json.user_id || json.userId,
        format: 'web',
      };
    } catch {
      errors.push('Invalid JSON format');
      return null;
    }
  }
  
  // Try raw format
  return parseRawInput(data, errors);
}

function validateSession(session: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!session) {
    errors.push('No session data found');
    return { valid: false, errors };
  }
  
  if (!session.dc_id || session.dc_id < 1 || session.dc_id > 5) {
    errors.push('DC ID must be between 1 and 5');
  }
  
  if (!session.auth_key) {
    errors.push('Auth key is required');
  } else if (session.auth_key.length !== 512) {
    errors.push(`Auth key must be 256 bytes (512 hex chars). Got ${session.auth_key.length} chars.`);
  } else if (!/^[0-9a-fA-F]+$/.test(session.auth_key)) {
    errors.push('Auth key must be a valid hex string');
  }
  
  return { valid: errors.length === 0, errors };
}
