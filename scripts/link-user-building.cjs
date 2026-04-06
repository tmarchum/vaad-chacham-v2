const https = require('https')

const TOKEN = 'sbp_fee8cac1c548949188f67ece57a5b386c0266f95'
const PROJECT_REF = 'stncskqjrmecjckxldvi'
const USER_ID = 'e97436d9-7b98-4fa6-acd6-9b498e901e28'
const BUILDING_ID = 'a1b2c3d4-0000-0000-0000-000000000001'

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
  // Link user to building as admin member
  const r1 = await query(`
    INSERT INTO public.building_memberships (user_id, building_id, role)
    VALUES ('${USER_ID}', '${BUILDING_ID}', 'admin')
    ON CONFLICT (user_id, building_id) DO UPDATE SET role = 'admin'
    RETURNING *
  `)
  console.log('Building membership:', r1.data)

  // Also make sure the trigger auto-link works for future users
  // Update handle_new_user trigger to also insert membership for first user
  const r2 = await query(`
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE
      v_role text;
      v_first_building_id uuid;
    BEGIN
      -- Determine role: first user = admin
      v_role := CASE WHEN (SELECT count(*) FROM public.profiles) = 0 THEN 'admin' ELSE 'resident' END;

      INSERT INTO public.profiles (id, email, first_name, last_name, role)
      VALUES (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'given_name', split_part(new.email,'@',1)),
        coalesce(new.raw_user_meta_data->>'family_name', ''),
        v_role
      );

      -- If first user (admin), link to all existing buildings
      IF v_role = 'admin' THEN
        INSERT INTO public.building_memberships (user_id, building_id, role)
        SELECT new.id, id, 'admin' FROM public.buildings
        ON CONFLICT DO NOTHING;
      END IF;

      -- Auto-link unit_residents by email
      UPDATE public.unit_residents SET user_id = new.id WHERE email = new.email AND user_id IS NULL;

      RETURN new;
    END;
    $$;
  `)
  console.log('Trigger updated:', r2.status === 200 ? '✓' : r2.data)

  // Verify: check is_admin() now works via building membership count
  const r3 = await query(`
    SELECT
      p.email, p.role,
      (SELECT count(*) FROM public.building_memberships WHERE user_id = '${USER_ID}') as memberships
    FROM public.profiles p WHERE p.id = '${USER_ID}'
  `)
  console.log('Final check:', r3.data)
}

main().catch(console.error)
