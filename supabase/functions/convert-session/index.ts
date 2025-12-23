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
    const { files, sourceFormat, targetFormats, userId } = await req.json();
    
    console.log(`Converting ${files.length} files from ${sourceFormat} to ${targetFormats.join(', ')}`);
    
    const results: any[] = [];
    
    for (const file of files) {
      for (const targetFormat of targetFormats) {
        // Parse session based on source format
        const sessionData = parseSession(file.data, sourceFormat);
        
        if (!sessionData) {
          continue;
        }
        
        // Convert to target format
        const converted = convertToFormat(sessionData, targetFormat);
        const filename = `${file.name.split('.')[0]}_${targetFormat}${getExtension(targetFormat)}`;
        
        results.push({
          format: targetFormat,
          filename,
          data: btoa(converted),
          size: converted.length,
        });
      }
    }
    
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

function parseSession(base64Data: string, format: string): any {
  try {
    const data = atob(base64Data);
    
    if (format === 'raw' || format === 'telethon') {
      // Try to parse as DC_ID:AUTH_KEY format or raw auth key
      if (data.includes(':')) {
        const [dcId, authKey] = data.split(':');
        return { dc_id: parseInt(dcId), auth_key: authKey.trim() };
      }
      // Assume it's just an auth key with default DC
      return { dc_id: 2, auth_key: data.trim() };
    }
    
    if (format === 'web' || format === 'json') {
      const json = JSON.parse(data);
      return {
        dc_id: json.dc_id || json.dcId || 2,
        auth_key: json.auth_key || json.authKey || '',
        user_id: json.user_id || json.userId,
      };
    }
    
    // For binary formats, extract what we can
    return { dc_id: 2, auth_key: data };
  } catch (e) {
    console.error('Parse error:', e);
    return null;
  }
}

function convertToFormat(session: any, format: string): string {
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
    case 'pyrogram':
      return `${session.dc_id}:${session.auth_key}`;
    default:
      return `${session.dc_id}:${session.auth_key}`;
  }
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
  };
  return extensions[format] || '.txt';
}
