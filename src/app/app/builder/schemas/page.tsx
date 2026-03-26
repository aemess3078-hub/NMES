import Link from 'next/link';
import { getSchemas } from '@/lib/actions/schema.actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, ChevronRight } from 'lucide-react';
import { DeleteSchemaButton } from '@/components/schema-builder/delete-schema-button';

export default async function SchemasPage() {
  const schemas = await getSchemas();

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[28px] font-semibold leading-[1.2] tracking-tight text-foreground mb-1">
            스키마 빌더
          </h1>
          <p className="text-[15px] leading-[1.5] text-muted-foreground">
            기준정보 구조를 정의하고 관리합니다
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/app/builder/schemas/new">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            새 스키마
          </Link>
        </Button>
      </div>

      {schemas.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border rounded-lg">
          <p className="text-[15px] leading-[1.5] text-muted-foreground mb-4">
            스키마가 없습니다
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/app/builder/schemas/new">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              스키마 만들기
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {/* 요약 */}
          <div className="flex items-center gap-6 mb-6 pb-4 border-b border-border">
            <div>
              <span className="text-[26px] font-semibold leading-[1.2]">{schemas.length}</span>
              <span className="text-[14px] text-muted-foreground ml-1.5">스키마</span>
            </div>
            <div>
              <span className="text-[26px] font-semibold leading-[1.2]">
                {schemas.reduce((s, sc) => s + sc.fields.length, 0)}
              </span>
              <span className="text-[14px] text-muted-foreground ml-1.5">필드</span>
            </div>
            <div>
              <span className="text-[26px] font-semibold leading-[1.2]">
                {schemas.reduce((s, sc) => s + sc.relations.length, 0)}
              </span>
              <span className="text-[14px] text-muted-foreground ml-1.5">관계</span>
            </div>
          </div>

          {/* 목록 */}
          <div className="divide-y divide-border">
            {schemas.map((schema) => (
              <div key={schema.id} className="flex items-center gap-3 py-3 group">
                <Link href={`/app/data/${schema.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0"
                    style={{ backgroundColor: schema.color ?? '#6366f1' }}
                  >
                    {schema.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-foreground truncate">{schema.name}</span>
                      {schema.isTemplate && (
                        <Badge variant="secondary" className="text-[13px] h-5 px-2">템플릿</Badge>
                      )}
                    </div>
                    {schema.description && (
                      <p className="text-[13px] leading-[1.5] text-muted-foreground truncate mt-0.5">
                        {schema.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex flex-wrap gap-1 max-w-[200px] hidden md:flex">
                      {schema.fields.slice(0, 4).map((f) => (
                        <span
                          key={f.id}
                          className="text-[13px] leading-[1.5] text-muted-foreground px-1.5 py-0.5 bg-muted rounded"
                        >
                          {f.name}
                        </span>
                      ))}
                      {schema.fields.length > 4 && (
                        <span className="text-[13px] leading-[1.5] text-muted-foreground">
                          +{schema.fields.length - 4}
                        </span>
                      )}
                    </div>
                    <span className="text-[13px] leading-[1.5] text-muted-foreground hidden sm:block">
                      {schema.fields.length}개 필드
                    </span>
                  </div>
                </Link>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <Link href={`/app/builder/schemas/${schema.id}`}>
                    <button className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </Link>
                  {!schema.isSystem && (
                    <DeleteSchemaButton schemaId={schema.id} schemaName={schema.name} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
