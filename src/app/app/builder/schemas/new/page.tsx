import { getSchemas } from '@/lib/actions/schema.actions';
import { SchemaBuilderClient } from '@/components/schema-builder/schema-builder-client';

export default async function NewSchemaPage() {
  const allSchemas = await getSchemas();

  return (
    <SchemaBuilderClient
      mode="create"
      allSchemas={allSchemas.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
