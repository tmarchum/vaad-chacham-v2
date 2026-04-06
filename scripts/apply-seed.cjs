const fs = require('fs')
const https = require('https')
const path = require('path')

const TOKEN = 'sbp_fee8cac1c548949188f67ece57a5b386c0266f95'
const PROJECT_REF = 'stncskqjrmecjckxldvi'

const sql = fs.readFileSync(path.join(__dirname, '../supabase/seed.sql'), 'utf8')

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
  res.on('data', (chunk) => { data += chunk })
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('Seed data applied successfully!')
      try {
        const parsed = JSON.parse(data)
        console.log('Response:', JSON.stringify(parsed).substring(0, 200))
      } catch {
        console.log('Response:', data.substring(0, 200))
      }
    } else {
      console.error(`Error ${res.statusCode}:`, data)
      process.exit(1)
    }
  })
})

req.on('error', (e) => {
  console.error('Request error:', e.message)
  process.exit(1)
})

req.write(body)
req.end()
