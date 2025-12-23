import React, { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SESSION_FORMATS, SessionFormat, ConversionResult } from '@/lib/session-formats';
import { 
  Upload, 
  FileText, 
  Download, 
  RefreshCw, 
  X, 
  Check,
  Loader2,
  ArrowRight,
  Archive
} from 'lucide-react';
import { cn } from '@/lib/utils';
import JSZip from 'jszip';

const Converter: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [files, setFiles] = useState<File[]>([]);
  const [sourceFormat, setSourceFormat] = useState<SessionFormat | ''>('');
  const [targetFormats, setTargetFormats] = useState<SessionFormat[]>([]);
  const [converting, setConverting] = useState(false);
  const [results, setResults] = useState<ConversionResult[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...droppedFiles]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const toggleTargetFormat = (format: SessionFormat) => {
    setTargetFormats(prev => 
      prev.includes(format)
        ? prev.filter(f => f !== format)
        : [...prev, format]
    );
  };

  const handleConvert = async () => {
    if (files.length === 0 || !sourceFormat || targetFormats.length === 0) {
      toast({
        title: 'Missing information',
        description: 'Please select files, source format, and at least one target format.',
        variant: 'destructive',
      });
      return;
    }

    setConverting(true);
    setResults([]);

    try {
      // Read files as base64, handle ZIP files specially
      const fileDataPromises = files.map(async (file) => {
        const isZip = file.name.toLowerCase().endsWith('.zip');
        
        if (isZip) {
          // Extract ZIP contents
          const zip = new JSZip();
          const zipData = await zip.loadAsync(file);
          const zipContents: { name: string; data: string }[] = [];
          
          for (const [filename, zipEntry] of Object.entries(zipData.files)) {
            if (!zipEntry.dir) {
              const content = await zipEntry.async('base64');
              zipContents.push({ name: filename, data: content });
            }
          }
          
          return {
            name: file.name,
            data: '',
            isZip: true,
            zipContents,
          };
        }
        
        // Regular file
        return new Promise<{ name: string; data: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve({ name: file.name, data: base64 });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const fileData = await Promise.all(fileDataPromises);

      // Call edge function for conversion
      const { data, error } = await supabase.functions.invoke('convert-session', {
        body: {
          files: fileData,
          sourceFormat,
          targetFormats,
          userId: user?.id,
        },
      });

      if (error) throw error;

      setResults(data.results || []);

      // Record conversion in history
      if (user?.id) {
        await supabase.from('conversion_history').insert({
          user_id: user.id,
          source_format: sourceFormat,
          target_formats: targetFormats,
          file_count: files.length,
          status: 'completed',
        });
        
        // Update profile conversion count
        await supabase.from('profiles')
          .update({ total_conversions: (await supabase.from('profiles').select('total_conversions').eq('user_id', user.id).single()).data?.total_conversions + 1 || 1 })
          .eq('user_id', user.id);
      }

      // Update profile conversion count
      await supabase.rpc('increment_conversions', { uid: user?.id });

      toast({
        title: 'Conversion complete!',
        description: `Successfully converted ${files.length} file(s) to ${targetFormats.length} format(s).`,
      });
    } catch (error: any) {
      console.error('Conversion error:', error);
      toast({
        title: 'Conversion failed',
        description: error.message || 'An error occurred during conversion.',
        variant: 'destructive',
      });
    } finally {
      setConverting(false);
    }
  };

  const downloadResult = (result: ConversionResult) => {
    const blob = new Blob([atob(result.data)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    results.forEach(downloadResult);
  };

  const formatOptions = Object.entries(SESSION_FORMATS).filter(([key]) => key !== sourceFormat);

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="animate-fade-in">
        <h1 className="text-3xl font-semibold text-foreground">Session Converter</h1>
        <p className="text-muted-foreground mt-1">
          Convert Telegram sessions between different client formats
        </p>
      </div>

      {/* Upload Area */}
      <Card className="border-border/50 animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <CardHeader>
          <CardTitle className="text-lg">Upload Session Files</CardTitle>
          <CardDescription>Drop your session files here or click to browse</CardDescription>
        </CardHeader>
        <CardContent>
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
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
              accept=".session,.json,.txt,.tdata,.zip"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-foreground font-medium">
                {dragOver ? 'Drop files here' : 'Click or drag files to upload'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Supports .session, .json, .txt, .tdata, .zip files
              </p>
            </label>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50"
                >
                  <div className="flex items-center gap-3">
                    {file.name.toLowerCase().endsWith('.zip') ? (
                      <Archive className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(2)} KB
                        {file.name.toLowerCase().endsWith('.zip') && ' (ZIP archive)'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(index)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conversion Settings */}
      <Card className="border-border/50 animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <CardHeader>
          <CardTitle className="text-lg">Conversion Settings</CardTitle>
          <CardDescription>Select source and target formats</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Source Format */}
          <div className="space-y-2">
            <Label>Source Format</Label>
            <Select value={sourceFormat} onValueChange={(v) => setSourceFormat(v as SessionFormat)}>
              <SelectTrigger>
                <SelectValue placeholder="Select source format" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SESSION_FORMATS).map(([key, format]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex flex-col">
                      <span>{format.name}</span>
                      <span className="text-xs text-muted-foreground">{format.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target Formats */}
          <div className="space-y-3">
            <Label>Target Formats</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {formatOptions.map(([key, format]) => (
                <label
                  key={key}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                    targetFormats.includes(key as SessionFormat)
                      ? 'border-primary bg-accent'
                      : 'border-border/50 hover:border-primary/30'
                  )}
                >
                  <Checkbox
                    checked={targetFormats.includes(key as SessionFormat)}
                    onCheckedChange={() => toggleTargetFormat(key as SessionFormat)}
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">{format.name}</p>
                    <p className="text-xs text-muted-foreground">{format.extension}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Convert Button */}
          <Button
            onClick={handleConvert}
            disabled={files.length === 0 || !sourceFormat || targetFormats.length === 0 || converting}
            className="w-full"
            size="lg"
          >
            {converting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5 mr-2" />
                Convert {files.length} File(s)
                <ArrowRight className="w-5 h-5 ml-2" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <Card className="border-border/50 animate-scale-in">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Check className="w-5 h-5 text-success" />
                  Conversion Complete
                </CardTitle>
                <CardDescription>{results.length} file(s) ready to download</CardDescription>
              </div>
              {results.length > 1 && (
                <Button variant="outline" onClick={downloadAll}>
                  <Download className="w-4 h-4 mr-2" />
                  Download All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {results.map((result, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-success/5 border border-success/20"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-success" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{result.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {SESSION_FORMATS[result.format].name} • {(result.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadResult(result)}
                    className="text-success hover:text-success hover:bg-success/10"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Converter;
