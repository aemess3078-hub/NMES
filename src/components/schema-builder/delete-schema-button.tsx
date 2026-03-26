'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { deleteSchema } from '@/lib/actions/schema.actions';

interface DeleteSchemaButtonProps {
  schemaId: string;
  schemaName: string;
}

export function DeleteSchemaButton({ schemaId, schemaName }: DeleteSchemaButtonProps) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteSchema(schemaId);
    setIsDeleting(false);

    if (result.success) {
      setOpen(false);
      router.refresh();
    } else {
      alert(result.error ?? '삭제에 실패했습니다.');
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        title="삭제"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>스키마 삭제</DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-foreground">{schemaName}</span> 스키마를 삭제하면
              관련된 모든 데이터와 메뉴도 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? '삭제 중...' : '삭제'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
