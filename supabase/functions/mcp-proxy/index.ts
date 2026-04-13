import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const GMAIL_USER = Deno.env.get('GMAIL_USER') || ''
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ─── MCP Tool definitions ─────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_building_info',
    description: 'קבלת פרטי בניין כולל תעריפים, מספר דירות, הנחות חברי ועד',
    inputSchema: {
      type: 'object',
      properties: {
        building_id: { type: 'string', description: 'מזהה הבניין' },
      },
      required: ['building_id'],
    },
  },
  {
    name: 'get_units_and_residents',
    description: 'קבלת כל הדירות והדיירים של הבניין',
    inputSchema: {
      type: 'object',
      properties: {
        building_id: { type: 'string', description: 'מזהה הבניין' },
      },
      required: ['building_id'],
    },
  },
  {
    name: 'get_expenses',
    description: 'קבלת הוצאות הבניין לפי שנה',
    inputSchema: {
      type: 'object',
      properties: {
        building_id: { type: 'string', description: 'מזהה הבניין' },
        year: { type: 'string', description: 'שנה (למשל 2026)', default: new Date().getFullYear().toString() },
      },
      required: ['building_id'],
    },
  },
  {
    name: 'get_income',
    description: 'קבלת הכנסות מדמי ועד (תנועות בנק עם קרדיט) לפי שנה',
    inputSchema: {
      type: 'object',
      properties: {
        building_id: { type: 'string', description: 'מזהה הבניין' },
        year: { type: 'string', description: 'שנה', default: new Date().getFullYear().toString() },
      },
      required: ['building_id'],
    },
  },
  {
    name: 'get_payments',
    description: 'קבלת כל רשומות התשלום של הבניין',
    inputSchema: {
      type: 'object',
      properties: {
        building_id: { type: 'string', description: 'מזהה הבניין' },
        month: { type: 'string', description: 'חודש ספציפי (2026-01) או ריק לכל החודשים' },
      },
      required: ['building_id'],
    },
  },
  {
    name: 'get_collection_cases',
    description: 'קבלת תיקי גבייה פתוחים של הבניין',
    inputSchema: {
      type: 'object',
      properties: {
        building_id: { type: 'string', description: 'מזהה הבניין' },
        status: { type: 'string', description: 'סטטוס: open או closed', default: 'open' },
      },
      required: ['building_id'],
    },
  },
  {
    name: 'upsert_collection_case',
    description: 'יצירה או עדכון תיק גבייה',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'מזהה תיק קיים לעדכון (ריק ליצירת חדש)' },
        building_id: { type: 'string' },
        unit_id: { type: 'string' },
        unit_number: { type: 'number' },
        resident_name: { type: 'string' },
        resident_email: { type: 'string' },
        resident_phone: { type: 'string' },
        total_debt: { type: 'number' },
        months_overdue: { type: 'number' },
        unpaid_months: { type: 'array', items: { type: 'string' } },
        escalation_level: { type: 'string', description: 'reminder | warning | formal | legal' },
        next_action_date: { type: 'string' },
        status: { type: 'string', description: 'open | closed' },
        history: { type: 'array' },
        last_notified_at: { type: 'string' },
        auto_closed: { type: 'boolean' },
      },
      required: ['building_id', 'unit_id'],
    },
  },
  {
    name: 'send_email',
    description: 'שליחת מייל לדייר (תזכורת/אזהרה/מכתב רשמי)',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'כתובת מייל' },
        subject: { type: 'string', description: 'נושא' },
        html: { type: 'string', description: 'תוכן HTML' },
        building_id: { type: 'string' },
        unit_id: { type: 'string' },
        case_id: { type: 'string' },
      },
      required: ['to', 'subject', 'html'],
    },
  },
  {
    name: 'write_alerts',
    description: 'כתיבת התראות חדשות לועד הבית (מוחק התראות ישנות שלא נקראו מאותו סוג)',
    inputSchema: {
      type: 'object',
      properties: {
        building_id: { type: 'string' },
        agent_type: { type: 'string', description: 'expense_analysis | budget | collection' },
        alerts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              severity: { type: 'string', description: 'high | medium | low' },
              title: { type: 'string' },
              description: { type: 'string' },
              recommendation: { type: 'string' },
              category: { type: 'string' },
            },
            required: ['severity', 'title', 'description'],
          },
        },
      },
      required: ['building_id', 'agent_type', 'alerts'],
    },
  },
]

// ─── Tool handlers ──────────────────────────────────────────────────────────

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_building_info': {
      const { data, error } = await supabase
        .from('buildings')
        .select('id, name, monthly_fee, fee_tiers, fee_mode, board_member_discount')
        .eq('id', args.building_id)
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) throw new Error('Building not found')
      const building = data[0]
      // Also get unit count
      const { count } = await supabase
        .from('units')
        .select('id', { count: 'exact', head: true })
        .eq('building_id', args.building_id)
      return { ...building, unit_count: count }
    }

    case 'get_units_and_residents': {
      const { data: units } = await supabase
        .from('units')
        .select('id, number, monthly_fee, rooms, board_member')
        .eq('building_id', args.building_id)
      const { data: residents } = await supabase
        .from('unit_residents')
        .select('unit_id, first_name, last_name, email, phone, owner_email, owner_phone, is_primary, resident_type')
      // Map residents to units
      const unitMap = (units || []).map(u => {
        const unitResidents = (residents || []).filter(r => r.unit_id === u.id)
        return { ...u, residents: unitResidents }
      })
      return unitMap
    }

    case 'get_expenses': {
      const year = (args.year as string) || new Date().getFullYear().toString()
      const { data } = await supabase
        .from('expenses')
        .select('date, description, amount, category')
        .eq('building_id', args.building_id)
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`)
        .order('date')
      return data || []
    }

    case 'get_income': {
      const year = (args.year as string) || new Date().getFullYear().toString()
      const { data } = await supabase
        .from('bank_transactions')
        .select('transaction_date, credit, month, description')
        .eq('building_id', args.building_id)
        .gt('credit', 0)
        .gte('transaction_date', `${year}-01-01`)
        .order('transaction_date')
      return data || []
    }

    case 'get_payments': {
      let query = supabase
        .from('payments')
        .select('*')
        .eq('building_id', args.building_id)
      if (args.month) {
        query = query.eq('month', args.month)
      }
      const { data } = await query
      return data || []
    }

    case 'get_collection_cases': {
      const status = (args.status as string) || 'open'
      const { data } = await supabase
        .from('collection_cases')
        .select('*')
        .eq('building_id', args.building_id)
        .eq('status', status)
      return data || []
    }

    case 'upsert_collection_case': {
      const { id, ...rest } = args as Record<string, unknown>
      if (id) {
        // Update
        const { data, error } = await supabase
          .from('collection_cases')
          .update({ ...rest, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single()
        if (error) throw new Error(error.message)
        return data
      } else {
        // Insert
        const { data, error } = await supabase
          .from('collection_cases')
          .insert(rest)
          .select()
          .single()
        if (error) throw new Error(error.message)
        return data
      }
    }

    case 'send_email': {
      const { to, subject, html, building_id, unit_id, case_id } = args as Record<string, string>
      let success = false
      let errorMsg = ''

      // Send via Gmail SMTP using fetch to a mail API, or log if not configured
      if (GMAIL_USER && GMAIL_APP_PASSWORD) {
        try {
          // Use Supabase send-notification function
          const res = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ to, subject, html, buildingId: building_id, unitId: unit_id, caseId: case_id }),
          })
          const result = await res.json()
          success = result.success
          if (!success) errorMsg = 'send-notification returned false'
        } catch (e) {
          errorMsg = (e as Error).message
        }
      } else {
        // Log only
        await supabase.from('notification_log').insert({
          building_id: building_id || null,
          unit_id: unit_id || null,
          case_id: case_id || null,
          channel: 'email',
          recipient: to,
          subject,
          body: html,
          status: 'logged',
          error_message: 'No email provider configured in MCP proxy',
        })
        success = true
        errorMsg = 'logged_only'
      }

      return { success, error: errorMsg }
    }

    case 'write_alerts': {
      const { building_id, agent_type, alerts } = args as {
        building_id: string
        agent_type: string
        alerts: Array<Record<string, string>>
      }

      // Delete old unread alerts from this agent type
      await supabase
        .from('agent_alerts')
        .delete()
        .eq('building_id', building_id)
        .eq('agent_type', agent_type)
        .eq('is_read', false)

      // Insert new alerts
      const rows = alerts.map(a => ({
        building_id,
        agent_type,
        severity: a.severity || 'medium',
        title: a.title,
        description: a.description,
        recommendation: a.recommendation || '',
        category: a.category || agent_type,
      }))

      const { error } = await supabase.from('agent_alerts').insert(rows)
      if (error) throw new Error(error.message)

      return { inserted: rows.length }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// ─── MCP Protocol Handler (Streamable HTTP) ───────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function jsonRpcResponse(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // GET = SSE endpoint for server-initiated messages (not needed for stateless)
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok', protocol: 'mcp', version: '2025-03-26' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()

    // Handle batch requests
    if (Array.isArray(body)) {
      const results = await Promise.all(body.map(handleJsonRpc))
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = await handleJsonRpc(body)
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify(jsonRpcError(null, -32700, (err as Error).message)),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

async function handleJsonRpc(msg: { jsonrpc: string; id?: unknown; method: string; params?: Record<string, unknown> }) {
  const { id, method, params } = msg

  switch (method) {
    case 'initialize':
      return jsonRpcResponse(id, {
        protocolVersion: '2025-03-26',
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: 'vaad-supabase-mcp',
          version: '1.0.0',
        },
      })

    case 'notifications/initialized':
      // Client acknowledges — no response needed for notifications
      return undefined

    case 'tools/list':
      return jsonRpcResponse(id, { tools: TOOLS })

    case 'tools/call': {
      const toolName = params?.name as string
      const toolArgs = (params?.arguments || {}) as Record<string, unknown>

      if (!toolName) {
        return jsonRpcError(id, -32602, 'Missing tool name')
      }

      try {
        const result = await handleToolCall(toolName, toolArgs)
        return jsonRpcResponse(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        })
      } catch (err) {
        return jsonRpcResponse(id, {
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          isError: true,
        })
      }
    }

    case 'ping':
      return jsonRpcResponse(id, {})

    default:
      return jsonRpcError(id, -32601, `Method not found: ${method}`)
  }
}
