import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const ENV_FILE = path.join(ROOT, ".env.deploy")
const BUCKET_NAME = "work-standards"

function loadEnvDeploy() {
  if (!fs.existsSync(ENV_FILE)) return

  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue

    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] ??= value
  }
}

function authHeaders() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.")
  }

  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  }
}

async function request(pathname: string, init: RequestInit = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.")
  }

  return fetch(`${supabaseUrl}${pathname}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init.headers ?? {}),
    },
  })
}

async function main() {
  loadEnvDeploy()

  const bucketRes = await request(`/storage/v1/bucket/${BUCKET_NAME}`)
  if (bucketRes.status === 400 || bucketRes.status === 404) {
    const createRes = await request("/storage/v1/bucket", {
      method: "POST",
      body: JSON.stringify({
        id: BUCKET_NAME,
        name: BUCKET_NAME,
        public: true,
        file_size_limit: 20 * 1024 * 1024,
        allowed_mime_types: ["application/pdf"],
      }),
    })

    if (!createRes.ok) {
      throw new Error(`Failed to create bucket: HTTP ${createRes.status}`)
    }
  } else if (!bucketRes.ok) {
    throw new Error(`Failed to read bucket: HTTP ${bucketRes.status}`)
  }

  const updateRes = await request(`/storage/v1/bucket/${BUCKET_NAME}`, {
    method: "PUT",
    body: JSON.stringify({
      public: true,
      file_size_limit: 20 * 1024 * 1024,
      allowed_mime_types: ["application/pdf"],
    }),
  })

  if (!updateRes.ok) {
    throw new Error(`Failed to update bucket: HTTP ${updateRes.status}`)
  }

  const verifyRes = await request(`/storage/v1/bucket/${BUCKET_NAME}`)
  if (!verifyRes.ok) {
    throw new Error(`Failed to verify bucket: HTTP ${verifyRes.status}`)
  }

  const bucket = await verifyRes.json()
  console.log(JSON.stringify({
    name: bucket.name,
    public: bucket.public,
    fileSizeLimit: bucket.file_size_limit,
    allowedMimeTypes: bucket.allowed_mime_types,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
