-- ============================================================
-- Partial Unique Indexes (Prisma schema.prisma 표현 불가)
-- prisma migrate deploy 이후 수동으로 실행하거나
-- migration SQL 파일에 포함하여 적용할 것
-- ============================================================

-- TenantUser: 사이트 미지정 전역 멤버십 unique
-- (tenantId, profileId) 조합은 siteId IS NULL일 때만 unique 보장
CREATE UNIQUE INDEX IF NOT EXISTS tenant_users_unique_global_membership
  ON "TenantUser" (tenant_id, profile_id)
  WHERE site_id IS NULL;

-- TenantUser: 특정 사이트 멤버십 unique
-- (tenantId, profileId, siteId) 조합은 siteId IS NOT NULL일 때만 unique 보장
CREATE UNIQUE INDEX IF NOT EXISTS tenant_users_unique_site_membership
  ON "TenantUser" (tenant_id, profile_id, site_id)
  WHERE site_id IS NOT NULL;

-- InventoryBalance: LOT 미추적 품목의 재고 스냅샷 unique
-- lotId가 NULL인 경우 (tenantId, itemId, locationId) 조합으로 unique 보장
CREATE UNIQUE INDEX IF NOT EXISTS inventory_balances_unique_without_lot
  ON "InventoryBalance" (tenant_id, item_id, location_id)
  WHERE lot_id IS NULL;

-- InventoryBalance: LOT 추적 품목의 재고 스냅샷 unique
-- lotId가 NOT NULL인 경우 (tenantId, itemId, lotId, locationId) 조합으로 unique 보장
CREATE UNIQUE INDEX IF NOT EXISTS inventory_balances_unique_with_lot
  ON "InventoryBalance" (tenant_id, item_id, lot_id, location_id)
  WHERE lot_id IS NOT NULL;
