const https = require('https')

const TOKEN = 'sbp_fee8cac1c548949188f67ece57a5b386c0266f95'
const PROJECT_REF = 'stncskqjrmecjckxldvi'

function query(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql })
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, data }) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function main() {
  const userId = 'e97436d9-7b98-4fa6-acd6-9b498e901e28' // from profiles

  // Test: can this user update a building? (simulate RLS as the user)
  const r1 = await query(`
    SELECT
      (SELECT public.is_admin() FROM public.profiles WHERE id = '${userId}') as is_admin_result,
      (SELECT role FROM public.profiles WHERE id = '${userId}') as role
  `)
  console.log('Admin check:', r1.data)

  // Check if units are visible
  const r2 = await query(`SELECT id, number, building_id FROM public.units LIMIT 3`)
  console.log('Units sample:', r2.data)

  // Check if payments are visible
  const r3 = await query(`SELECT id, month, status, unit_id FROM public.payments LIMIT 3`)
  console.log('Payments sample:', r3.data)

  // Try a direct update (service role bypasses RLS - just to test the mechanism)
  const r4 = await query(`
    UPDATE public.payments
    SET notes = 'test-edit-${Date.now()}'
    WHERE id = '00000001-0002-0000-0000-000000000001'
    RETURNING id, notes, status
  `)
  console.log('Direct update test:', r4.data)
}

main().catch(console.error)
