"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { DataTable } from "@/components/common/data-table"
import { getColumns } from "./columns"
import { LocationFormSheet } from "./location-form-sheet"
import { LocationWithSite, deleteLocation } from "@/lib/actions/location.actions"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

type Props = {
  data: LocationWithSite[]
  sites: { id: string; code: string; name: string }[]
}

export function LocationDataTable({ data, sites }: Props) {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<LocationWithSite | null>(null)

  const handleEdit = (location: LocationWithSite) => {
    setEditTarget(location)
    setSheetOpen(true)
  }

  const handleDelete = async (location: LocationWithSite) => {
    if (!confirm(`"${location.name}" 로케이션을 삭제하시겠습니까?`)) return
    try {
      await deleteLocation(location.id)
      router.refresh()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const columns = getColumns({ onEdit: handleEdit, onDelete: handleDelete })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditTarget(null)
            setSheetOpen(true)
          }}
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          로케이션 등록
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchableColumns={[{ id: "name", title: "이름" }]}
        filterableColumns={[]}
      />

      <LocationFormSheet
        mode={editTarget ? "edit" : "create"}
        location={editTarget}
        sites={sites}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) setEditTarget(null)
        }}
      />
    </div>
  )
}
