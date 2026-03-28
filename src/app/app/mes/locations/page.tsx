export const dynamic = "force-dynamic"

import { getLocations, getSitesForLocation } from "@/lib/actions/location.actions"
import { LocationDataTable } from "./location-data-table"

export default async function LocationsPage() {
  const [locations, sites] = await Promise.all([
    getLocations(),
    getSitesForLocation(),
  ])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-[27px] font-bold tracking-tight">로케이션 관리</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          창고/로케이션 마스터를 등록하고 관리합니다
        </p>
      </div>
      <LocationDataTable data={locations} sites={sites} />
    </div>
  )
}
