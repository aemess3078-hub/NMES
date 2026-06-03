export function isMissingDbObjectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: unknown }).code === "P2021" ||
      (error as { code?: unknown }).code === "P2022")
  )
}
