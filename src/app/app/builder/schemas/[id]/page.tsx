import { notFound } from 'next/navigation';
import { getSchemaById, getSchemas } from '@/lib/actions/schema.actions';
import { SchemaBuilderClient } from '@/components/schema-builder/schema-builder-client';

interface Props {
  params: { id: string };
}

export default async function EditSchemaPage({ params }: Props) {
  const [schema, allSchemas] = await Promise.all([
    getSchemaById(params.id),
    getSchemas(),
  ]);

  if (!schema) {
    notFound();
  }

  return (
    <SchemaBuilderClient
      mode="edit"
      initialSchema={schema}
      allSchemas={allSchemas
        .filter((s) => s.id !== params.id)
        .map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
