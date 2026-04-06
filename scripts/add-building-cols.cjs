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
    -- Add missing columns to buildings
    ALTER TABLE public.buildings
      ADD COLUMN IF NOT EXISTS alias text default '',
      ADD COLUMN IF NOT EXISTS year_built integer,
      ADD COLUMN IF NOT EXISTS parking integer default 0,
      ADD COLUMN IF NOT EXISTS storage integer default 0,
      ADD COLUMN IF NOT EXISTS gym boolean default false,
      ADD COLUMN IF NOT EXISTS shared_roof boolean default false,
      ADD COLUMN IF NOT EXISTS management_company boolean default false,
      ADD COLUMN IF NOT EXISTS branch text default '',
      ADD COLUMN IF NOT EXISTS holder text default '',
      ADD COLUMN IF NOT EXISTS authorized_signer text default '',
      ADD COLUMN IF NOT EXISTS board_member_discount numeric default 0,
      ADD COLUMN IF NOT EXISTS residents_room boolean default false,

      -- Fee tiers: stored as JSONB array
      -- fee_mode: 'flat' | 'by_rooms' | 'by_sqm'
      ADD COLUMN IF NOT EXISTS fee_mode text default 'flat',
      ADD COLUMN IF NOT EXISTS fee_tiers jsonb default '[]';

    -- fee_tiers format:
    -- by_rooms: [{ "rooms": 2, "fee": 300 }, { "rooms": 3, "fee": 400 }, ...]
    -- by_sqm:   [{ "min_sqm": 0, "max_sqm": 60, "fee": 300 }, ...]
  `
  const r = await query(sql)
  if (r.status >= 200 && r.status < 300) {
    console.log('✓ Columns added to buildings table')
  } else {
    console.error('Error:', r.data)
  }
}
main().catch(console.error)
