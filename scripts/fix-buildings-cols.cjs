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
  // 1. Check current column types on buildings
  const r0 = await query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'buildings'
    ORDER BY ordinal_position;
  `)
  console.log('Buildings columns:')
  r0.data.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} (default: ${c.column_default})`))

  // 2. Fix management_company: convert text → boolean
  console.log('\nFixing management_company column type text → boolean...')
  const r1 = await query(`
    ALTER TABLE public.buildings
      ALTER COLUMN management_company TYPE boolean
      USING (management_company IS NOT NULL AND management_company != '' AND management_company != 'false' AND management_company != '0');
  `)
  if (r1.status < 300) {
    console.log('✓ management_company → boolean')
  } else {
    console.log('management_company fix result:', JSON.stringify(r1.data))
  }

  // 3. Check issues table columns
  const r2 = await query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'issues'
    ORDER BY ordinal_position;
  `)
  console.log('\nIssues columns:')
  r2.data.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`))
}
main().catch(console.error)
