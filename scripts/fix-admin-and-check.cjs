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
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(data))
        else reject(new Error(`HTTP ${res.statusCode}: ${data}`))
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function main() {
  // Check existing profiles
  const profiles = await query('SELECT id, email, role FROM public.profiles')
  console.log('Profiles:', JSON.stringify(profiles, null, 2))

  // Ensure all existing users are admin (there should only be one so far)
  await query(`UPDATE public.profiles SET role = 'admin' WHERE role != 'admin'`)
  console.log('✓ All profiles set to admin')

  // Re-check
  const after = await query('SELECT id, email, role FROM public.profiles')
  console.log('After fix:', JSON.stringify(after, null, 2))
}

main().catch(console.error)
