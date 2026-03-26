import { notFound } from 'next/navigation';
import { getSchemaById } from '@/lib/actions/schema.actions';
import { getRecords } from '@/lib/actions/record.actions';
import { SchemaDataView } from '@/components/data-view/schema-data-view';

interface Props {
  params: { schemaId: string };
  searchParams: { page?: string; search?: string };
}

export default async function SchemaDataPage({ params, searchParams }: Props) {
  const schema = await getSchemaById(params.schemaId);

  if (!schema) {
    notFound();
  }

  const page = Number(searchParams.page ?? 1);
  const search = searchParams.search;

  const records = await getRecords(params.schemaId, { page, search });

  return (
    <SchemaDataView
      schema={schema}
      records={records}
      currentPage={page}
      search={search}
    />
  );
}
