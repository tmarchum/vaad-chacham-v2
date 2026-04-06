const https = require('https')

const TOKEN = 'sbp_fee8cac1c548949188f67ece57a5b386c0266f95'
const PROJECT_REF = 'stncskqjrmecjckxldvi'

const sql = `
INSERT INTO public.unit_residents (id, unit_id, first_name, last_name, phone, email, resident_type, is_primary)
VALUES
  ('00000001-0000-0001-0000-000000000001', '00000001-0001-0000-0000-000000000001', 'דוד', 'לוי', '050-1234567', 'david@example.com', 'owner', true),
  ('00000002-0000-0001-0000-000000000001', '00000002-0001-0000-0000-000000000001', 'רחל', 'כהן', '052-2345678', 'rachel@example.com', 'owner', true),
  ('00000003-0000-0001-0000-000000000001', '00000003-0001-0000-0000-000000000001', 'משה', 'ברגר', '054-3456789', 'moshe@example.com', 'owner', true),
  ('00000004-0000-0001-0000-000000000001', '00000004-0001-0000-0000-000000000001', 'שרה', 'גולן', '050-4567890', 'sara@example.com', 'owner', true),
  ('00000005-0000-0001-0000-000000000001', '00000005-0001-0000-0000-000000000001', 'יוסף', 'אברהם', '052-5678901', 'yosef@example.com', 'owner', true),
  ('00000006-0000-0001-0000-000000000001', '00000006-0001-0000-0000-000000000001', 'מרים', 'שפירא', '054-6789012', 'miriam@example.com', 'owner', true),
  ('00000007-0000-0001-0000-000000000001', '00000007-0001-0000-0000-000000000001', 'אברהם', 'פרץ', '050-7890123', 'avraham@example.com', 'owner', true),
  ('00000008-0000-0001-0000-000000000001', '00000008-0001-0000-0000-000000000001', 'חנה', 'מזרחי', '052-8901234', 'hana@example.com', 'owner', true)
ON CONFLICT (id) DO NOTHING;
`

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
      console.log('Residents inserted successfully!')
    } else {
      console.error(`Error ${res.statusCode}:`, data)
      process.exit(1)
    }
  })
})

req.on('error', (e) => { console.error('Request error:', e.message); process.exit(1) })
req.write(body)
req.end()
