import Link from 'next/link';
import { getSchemas } from '@/lib/actions/schema.actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Database, GitBranch, Layout, Plus, ArrowRight, Table, ChevronRight } from 'lucide-react';

export default async function AppHomePage() {
  const schemas = await getSchemas();
  const totalFields = schemas.reduce((sum, s) => sum + s.fields.length, 0);

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* 페이지 제목 */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
          홈
        </h1>
        <p className="text-muted-foreground">
          Cloud MES 워크스페이스에 오신 것을 환영합니다.
        </p>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        {[
          { label: '스키마', value: schemas.length, sub: '기준정보 구조' },
          { label: '필드', value: totalFields, sub: '정의된 필드' },
          { label: '플로우', value: 0, sub: '활성 프로세스' },
        ].map((stat) => (
          <div key={stat.label} className="py-4 border-b border-border">
            <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{stat.label}</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* 스키마 목록 */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-widest text-muted-foreground">
            기준정보
          </h2>
          <Link href="/app/builder/schemas/new">
            <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="h-3 w-3" />
              새 스키마
            </button>
          </Link>
        </div>

        {schemas.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-border rounded-lg">
            <p className="text-sm text-muted-foreground mb-3">스키마가 없습니다</p>
            <Link href="/app/builder/schemas/new">
              <Button size="sm" variant="outline">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                첫 번째 스키마 만들기
              </Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {schemas.slice(0, 10).map((schema) => (
              <Link key={schema.id} href={`/app/data/${schema.id}`}>
                <div className="flex items-center gap-3 py-2.5 group hover:bg-accent/50 rounded px-2 -mx-2 transition-colors cursor-pointer">
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                    style={{ backgroundColor: schema.color ?? '#6366f1' }}
                  >
                    {schema.name[0]}
                  </div>
                  <span className="flex-1 text-sm text-foreground truncate">{schema.name}</span>
                  {schema.description && (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px] hidden sm:block">
                      {schema.description}
                    </span>
                  )}
                  <Badge variant="secondary" className="text-xs font-normal hidden sm:flex">
                    {schema.fields.length}개
                  </Badge>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 빠른 이동 */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          빌더
        </h2>
        <div className="space-y-1">
          {[
            { href: '/app/builder/schemas', icon: Table, label: '스키마 빌더', desc: '기준정보 구조 정의' },
            { href: '/app/builder/flows', icon: GitBranch, label: '플로우 빌더', desc: '공정 흐름 설계' },
            { href: '/app/builder/screens', icon: Layout, label: '화면 빌더', desc: '커스텀 화면 구성' },
          ].map(({ href, icon: Icon, label, desc }) => (
            <Link key={href} href={href}>
              <div className="flex items-center gap-3 py-2 px-2 -mx-2 rounded hover:bg-accent transition-colors group cursor-pointer">
                <Icon className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />
                <span className="text-sm text-foreground">{label}</span>
                <span className="text-xs text-muted-foreground ml-1 hidden sm:block">{desc}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
