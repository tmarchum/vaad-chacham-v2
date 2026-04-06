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
  const sql = `
    ALTER TABLE public.issues
      ADD COLUMN IF NOT EXISTS estimated_cost numeric,
      ADD COLUMN IF NOT EXISTS unit_id uuid references public.units(id) on delete set null,
      ADD COLUMN IF NOT EXISTS scheduled_date timestamptz,
      ADD COLUMN IF NOT EXISTS assigned_to text default '';
  `
  const r = await query(sql)
  if (r.status >= 200 && r.status < 300) {
    console.log('✓ Columns added to issues table:', r.data)
  } else {
    console.error('Error:', JSON.stringify(r.data))
  }
}
main().catch(console.error)
