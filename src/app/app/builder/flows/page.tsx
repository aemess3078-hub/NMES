import Link from 'next/link';
import { GitBranch, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function FlowsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">플로우 빌더</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            공정 흐름과 업무 프로세스를 시각적으로 설계하세요
          </p>
        </div>
        <Button disabled>
          <Plus className="h-4 w-4 mr-2" />
          새 플로우 (준비 중)
        </Button>
      </div>

      <Card className="border-dashed border-2">
        <CardContent className="py-20 text-center">
          <GitBranch className="h-14 w-14 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h3 className="font-semibold text-lg mb-2">플로우 빌더 준비 중</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            React Flow 기반의 공정 설계 도구를 개발 중입니다.
            드래그앤드롭으로 공정 노드를 연결하고 시뮬레이션으로 검증할 수 있습니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
