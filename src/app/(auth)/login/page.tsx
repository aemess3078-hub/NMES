'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/app');
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setError('가입 확인 이메일을 발송했습니다. 이메일을 확인해주세요.');
        setMode('login');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(
          err.message === 'Invalid login credentials'
            ? '이메일 또는 비밀번호가 올바르지 않습니다.'
            : err.message
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* 로고 */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-foreground text-background text-base font-bold mb-5">
            M
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {mode === 'login' ? 'Cloud MES에 로그인' : '계정 만들기'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {mode === 'login'
              ? '이메일과 비밀번호를 입력하세요'
              : '새 계정을 만들어 시작하세요'
            }
          </p>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium text-foreground">
              이메일
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              required
              className="h-10 bg-white border-border text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-medium text-foreground">
              비밀번호
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="h-10 bg-white border-border text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
            />
          </div>

          {error && (
            <p className={`text-sm py-1 ${error.includes('발송') ? 'text-success' : 'text-destructive'}`}>
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full h-10 mt-1 bg-foreground text-background hover:bg-foreground/90"
            disabled={isLoading}
          >
            {isLoading
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />처리 중...</>
              : mode === 'login' ? '계속하기' : '계정 만들기'
            }
          </Button>
        </form>

        {/* 하단 링크 */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {mode === 'login'
              ? '계정이 없으신가요? 회원가입 →'
              : '이미 계정이 있으신가요? 로그인 →'
            }
          </button>
        </div>
      </div>
    </div>
  );
}
