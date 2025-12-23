import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  RefreshCw, 
  Search, 
  ArrowRight, 
  Zap,
  History,
  Smartphone,
  Monitor,
  Globe
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const Dashboard: React.FC = () => {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user?.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: recentHistory } = useQuery({
    queryKey: ['conversion_history', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversion_history')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const tools = [
    {
      title: 'Session Converter',
      description: 'Convert sessions between Telegram client formats',
      icon: RefreshCw,
      to: '/converter',
      color: 'bg-primary/10 text-primary',
    },
    {
      title: 'Session Validator',
      description: 'Validate and inspect session file contents',
      icon: Search,
      to: '/validator',
      color: 'bg-accent text-accent-foreground',
    },
  ];

  const supportedFormats = [
    { name: 'Android', icon: Smartphone },
    { name: 'Desktop', icon: Monitor },
    { name: 'Web', icon: Globe },
    { name: 'Telethon', icon: Zap },
    { name: 'Pyrogram', icon: Zap },
    { name: 'Android X', icon: Smartphone },
  ];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="animate-fade-in">
        <h1 className="text-3xl font-semibold text-foreground">
          Welcome back{profile?.display_name ? `, ${profile.display_name}` : ''}
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your Telegram sessions with ease
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <Card className="border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {profile?.total_conversions || 0}
                </p>
                <p className="text-sm text-muted-foreground">Total Conversions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
                <Zap className="w-6 h-6 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">6+</p>
                <p className="text-sm text-muted-foreground">Formats Supported</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                <History className="w-6 h-6 text-success" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {recentHistory?.length || 0}
                </p>
                <p className="text-sm text-muted-foreground">Recent Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tools Grid */}
      <div className="animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <h2 className="text-lg font-semibold text-foreground mb-4">Tools</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tools.map((tool) => (
            <Card 
              key={tool.to} 
              className="border-border/50 hover:border-primary/30 hover:shadow-lg transition-all duration-300 group cursor-pointer"
            >
              <Link to={tool.to}>
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className={`w-12 h-12 rounded-xl ${tool.color} flex items-center justify-center`}>
                      <tool.icon className="w-6 h-6" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-lg mb-1">{tool.title}</CardTitle>
                  <CardDescription>{tool.description}</CardDescription>
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      </div>

      {/* Supported Formats */}
      <div className="animate-slide-up" style={{ animationDelay: '0.3s' }}>
        <h2 className="text-lg font-semibold text-foreground mb-4">Supported Formats</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {supportedFormats.map((format) => (
            <div
              key={format.name}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-colors"
            >
              <format.icon className="w-6 h-6 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{format.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      {recentHistory && recentHistory.length > 0 && (
        <div className="animate-slide-up" style={{ animationDelay: '0.4s' }}>
          <h2 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h2>
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="space-y-4">
                {recentHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        <RefreshCw className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {item.source_format} → {item.target_formats?.join(', ')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.file_count} file(s)
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(item.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
