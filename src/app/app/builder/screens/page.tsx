import { Layout, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function ScreensPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">화면 빌더</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            드래그앤드롭으로 커스텀 화면을 구성하세요
          </p>
        </div>
        <Button disabled>
          <Plus className="h-4 w-4 mr-2" />
          새 화면 (준비 중)
        </Button>
      </div>

      <Card className="border-dashed border-2">
        <CardContent className="py-20 text-center">
          <Layout className="h-14 w-14 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h3 className="font-semibold text-lg mb-2">화면 빌더 준비 중</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            위젯 기반의 화면 구성 도구를 개발 중입니다.
            테이블, 폼, 차트 등 위젯을 배치하고 스키마와 연결할 수 있습니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
