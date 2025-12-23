import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SESSION_FORMATS, SessionData, maskAuthKey, validateSessionData } from '@/lib/session-formats';
import { 
  Upload, 
  FileText, 
  Search,
  Check,
  X,
  Eye,
  EyeOff,
  Copy,
  Loader2,
  Server,
  Key,
  User,
  Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';

const Validator: React.FC = () => {
  const { toast } = useToast();
  
  const [file, setFile] = useState<File | null>(null);
  const [rawInput, setRawInput] = useState('');
  const [validating, setValidating] = useState(false);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showAuthKey, setShowAuthKey] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setSessionData(null);
      setValidationErrors([]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setSessionData(null);
      setValidationErrors([]);
    }
  };

  const validateFile = async () => {
    if (!file) return;
    
    setValidating(true);
    setSessionData(null);
    setValidationErrors([]);

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = (reader.result as string).split(',')[1];
          resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke('validate-session', {
        body: {
          filename: file.name,
          data: base64,
        },
      });

      if (error) throw error;

      if (data.valid) {
        setSessionData(data.session);
      } else {
        setValidationErrors(data.errors || ['Unknown validation error']);
      }
    } catch (error: any) {
      console.error('Validation error:', error);
      setValidationErrors([error.message || 'Failed to validate session']);
    } finally {
      setValidating(false);
    }
  };

  const validateRawInput = async () => {
    if (!rawInput.trim()) return;
    
    setValidating(true);
    setSessionData(null);
    setValidationErrors([]);

    try {
      const { data, error } = await supabase.functions.invoke('validate-session', {
        body: {
          rawData: rawInput.trim(),
        },
      });

      if (error) throw error;

      if (data.valid) {
        setSessionData(data.session);
      } else {
        setValidationErrors(data.errors || ['Unknown validation error']);
      }
    } catch (error: any) {
      console.error('Validation error:', error);
      setValidationErrors([error.message || 'Failed to validate session']);
    } finally {
      setValidating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied!',
      description: 'Value copied to clipboard.',
    });
  };

  const clearAll = () => {
    setFile(null);
    setRawInput('');
    setSessionData(null);
    setValidationErrors([]);
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="animate-fade-in">
        <h1 className="text-3xl font-semibold text-foreground">Session Validator</h1>
        <p className="text-muted-foreground mt-1">
          Validate and inspect Telegram session data
        </p>
      </div>

      {/* Input Tabs */}
      <Card className="border-border/50 animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <CardContent className="pt-6">
          <Tabs defaultValue="file">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="file">Upload File</TabsTrigger>
              <TabsTrigger value="raw">Raw Input</TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="space-y-4">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                className={cn(
                  'border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer',
                  dragOver 
                    ? 'border-primary bg-accent/50' 
                    : 'border-border hover:border-primary/50 hover:bg-muted/30'
                )}
              >
                <input
                  type="file"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="validator-file-upload"
                  accept=".session,.json,.txt,.tdata"
                />
                <label htmlFor="validator-file-upload" className="cursor-pointer">
                  <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-foreground font-medium">
                    {file ? file.name : 'Click or drag file to upload'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {file ? `${(file.size / 1024).toFixed(2)} KB` : 'Supports .session, .json, .txt, .tdata'}
                  </p>
                </label>
              </div>

              {file && (
                <div className="flex gap-2">
                  <Button 
                    onClick={validateFile} 
                    disabled={validating}
                    className="flex-1"
                  >
                    {validating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Validating...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Validate Session
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={clearAll}>
                    Clear
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="raw" className="space-y-4">
              <div className="space-y-2">
                <Label>Session Data</Label>
                <Textarea
                  placeholder="Paste session string, auth key, or JSON data..."
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  rows={6}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Accepts: DC_ID:AUTH_KEY format, raw auth key, or JSON session data
                </p>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={validateRawInput} 
                  disabled={validating || !rawInput.trim()}
                  className="flex-1"
                >
                  {validating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Validate
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={clearAll}>
                  Clear
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5 animate-scale-in">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-destructive">
              <X className="w-5 h-5" />
              Validation Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {validationErrors.map((error, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-destructive">
                  <X className="w-4 h-4 mt-0.5 shrink-0" />
                  {error}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Session Data Display */}
      {sessionData && (
        <Card className="border-success/50 bg-success/5 animate-scale-in">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2 text-success">
                <Check className="w-5 h-5" />
                Valid Session
              </CardTitle>
              {sessionData.format && (
                <Badge variant="secondary">
                  {SESSION_FORMATS[sessionData.format]?.name || sessionData.format}
                </Badge>
              )}
            </div>
            <CardDescription>Session data parsed successfully</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {/* DC ID */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Server className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">DC ID</p>
                    <p className="text-xs text-muted-foreground">Data Center</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-semibold text-foreground">
                    {sessionData.dc_id}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => copyToClipboard(String(sessionData.dc_id))}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Auth Key */}
              <div className="p-3 rounded-lg bg-card border border-border/50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                      <Key className="w-5 h-5 text-accent-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Auth Key</p>
                      <p className="text-xs text-muted-foreground">256 bytes</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setShowAuthKey(!showAuthKey)}
                    >
                      {showAuthKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => copyToClipboard(sessionData.auth_key)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="p-2 rounded bg-muted/50 overflow-x-auto">
                  <code className="text-xs font-mono text-muted-foreground break-all">
                    {showAuthKey ? sessionData.auth_key : maskAuthKey(sessionData.auth_key)}
                  </code>
                </div>
              </div>

              {/* User ID */}
              {sessionData.user_id && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-success" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">User ID</p>
                      <p className="text-xs text-muted-foreground">Telegram User</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-semibold text-foreground">
                      {sessionData.user_id}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => copyToClipboard(String(sessionData.user_id))}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Bot Status */}
              {sessionData.is_bot !== undefined && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-warning" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Account Type</p>
                      <p className="text-xs text-muted-foreground">Bot or User</p>
                    </div>
                  </div>
                  <Badge variant={sessionData.is_bot ? 'secondary' : 'default'}>
                    {sessionData.is_bot ? 'Bot Account' : 'User Account'}
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Validator;
