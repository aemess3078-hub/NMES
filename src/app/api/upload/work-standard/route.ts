import { NextRequest, NextResponse } from "next/server"
import { requireRole, getTenantId } from "@/lib/auth"

// ─── 상수 ────────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  // 20 MB
const ALLOWED_CONTENT_TYPE = "application/pdf"
const BUCKET = "work-standards"

// ─── POST /api/upload/work-standard ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── 1. 인증 / 권한 ───────────────────────────────────────────────
    await requireRole("OPERATOR")
    const tenantId = await getTenantId()

    // ── 2. 환경 변수 확인 ────────────────────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        {
          error:
            "파일 저장소 설정이 필요합니다. " +
            "환경 변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)를 확인하세요.",
        },
        { status: 500 },
      )
    }

    // ── 3. FormData 파싱 / 파일 검증 ────────────────────────────────
    const formData = await req.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "파일을 선택하세요." }, { status: 400 })
    }
    if (file.type !== ALLOWED_CONTENT_TYPE) {
      return NextResponse.json(
        { error: "PDF 파일(.pdf)만 업로드할 수 있습니다." },
        { status: 400 },
      )
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "빈 파일은 업로드할 수 없습니다." }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "파일 크기는 20 MB 이하여야 합니다." },
        { status: 400 },
      )
    }

    // ── 4. 파일명 sanitize + 고유 경로 생성 ─────────────────────────
    const originalName = file.name.trim() || "document.pdf"
    const safeName = originalName
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .replace(/\.pdf$/i, "") || "file"
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    const rand    = Math.random().toString(36).slice(2, 8)
    const storagePath = `${tenantId}/${dateStr}-${rand}-${safeName}.pdf`

    // ── 5. Supabase Storage 업로드 (service role key → 서버에서만 사용) ──
    const arrayBuffer = await file.arrayBuffer()
    const uploadRes = await fetch(
      `${supabaseUrl}/storage/v1/object/${BUCKET}/${storagePath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": ALLOWED_CONTENT_TYPE,
          "x-upsert": "false",
        },
        body: arrayBuffer,
      },
    )

    if (!uploadRes.ok) {
      let errBody = ""
      try { errBody = JSON.stringify(await uploadRes.json()) } catch { errBody = await uploadRes.text().catch(() => "") }
      console.error(`[work-standard upload] Supabase HTTP ${uploadRes.status}: ${errBody}`)

      if (
        uploadRes.status === 400 &&
        (errBody.includes("Bucket") || errBody.includes("bucket") || errBody.includes("not found"))
      ) {
        return NextResponse.json(
          {
            error: `파일 저장 버킷 "${BUCKET}"을 찾을 수 없습니다. Supabase Storage 콘솔에서 "${BUCKET}" 이름의 공개(public) 버킷을 생성하세요.`,
          },
          { status: 500 },
        )
      }
      return NextResponse.json(
        { error: `파일 업로드에 실패했습니다. (HTTP ${uploadRes.status})` },
        { status: 500 },
      )
    }

    // ── 6. 공개 URL 반환 ─────────────────────────────────────────────
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`
    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : "파일 업로드 중 오류가 발생했습니다."
    if (message === "UNAUTHORIZED" || message === "FORBIDDEN") {
      return NextResponse.json({ error: "업로드 권한이 없습니다." }, { status: 403 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
