export async function fetchBackend(path) {
  try {
    const res = await fetch(`/api${path}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('API error:', err)
    return null
  }
}
