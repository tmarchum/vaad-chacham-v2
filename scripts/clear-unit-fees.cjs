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
  // Clear monthly_fee from all units so they inherit from building
  const r = await query(`
    UPDATE public.units SET monthly_fee = 0 WHERE monthly_fee > 0;
  `)
  console.log(r.status < 300 ? '✓ Cleared monthly_fee from all units' : 'Error: ' + JSON.stringify(r.data))

  // Verify
  const r2 = await query(`SELECT id, number, monthly_fee FROM public.units ORDER BY number`)
  console.log('Units after fix:', r2.data)
}
main().catch(console.error)
