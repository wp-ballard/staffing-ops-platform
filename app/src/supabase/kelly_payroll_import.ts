// supabase/functions/kelly_payroll_import/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@4";

type ImportRequest = {
  bucket: string; // e.g. "payroll-imports"
  path: string;   // e.g. "2025-12/payroll.xml"
  force?: boolean;
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function badRequest(msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toIsoDate(input: string): string | null {
  if (!input) return null;
  const s = String(input).trim();

  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // MM/DD/YYYY or MM/DD/YYYY <anything>
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+.*)?$/);
  if (us) {
    const mm = us[1].padStart(2, "0");
    const dd = us[2].padStart(2, "0");
    const yyyy = us[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

function toPgTimestamp(usDateTime: string): string | null {
  // "12/1/2025 7:00:00 AM" -> "2025-12-01 07:00:00"
  if (!usDateTime) return null;
  const m = String(usDateTime).trim().match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i,
  );
  if (!m) return null;

  let hour = parseInt(m[4], 10);
  const minute = m[5];
  const second = m[6];
  const ampm = m[7].toUpperCase();

  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  const mm = m[1].padStart(2, "0");
  const dd = m[2].padStart(2, "0");
  const yyyy = m[3];
  const hh = String(hour).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${minute}:${second}`;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function num(v: any): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normKey(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function getCardReport(parsed: any) {
  return (
    parsed?.CardReport ??
    parsed?.response?.CardReport ??
    parsed?.Response?.CardReport ??
    parsed?.["response"]?.["CardReport"] ??
    parsed?.["Response"]?.["CardReport"] ??
    null
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") return badRequest("Use POST");

  // ---- Auth gate (UI-safe)
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return badRequest("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Validate token and get user
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  const authUserId = userData.user.id;

  // Confirm staff user is ADMIN
  const staff = await supabase
    .schema("app")
    .from("staff_users")
    .select("staff_user_id, role_code, is_active")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (staff.error) return ok({ ok: false, step: "auth_staff_lookup", error: staff.error.message });
  if (!staff.data || !staff.data.is_active || staff.data.role_code !== "ADMIN") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  let body: ImportRequest;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const bucket = body.bucket?.trim();
  const path = body.path?.trim();
  const force = Boolean(body.force);

  if (!bucket || !path) return badRequest("Missing bucket/path");

  // 1) Download XML
  const dl = await supabase.storage.from(bucket).download(path);
  if (dl.error || !dl.data) {
    return ok({ ok: false, step: "download", error: dl.error?.message ?? "download failed" });
  }

  const xmlText = await dl.data.text();
  const xmlBytes = new TextEncoder().encode(xmlText);
  const fileSha = await sha256Hex(xmlBytes);

  // 2) Existing run by hash
  const existing = await supabase
    .schema("raw")
    .from("payroll_import_runs")
    .select("import_run_id, imported_at")
    .eq("source", "kelly")
    .eq("file_sha256", fileSha)
    .maybeSingle();

  if (existing.error) return ok({ ok: false, step: "dedupe_lookup", error: existing.error.message });

  if (existing.data?.import_run_id && !force) {
    return ok({
      ok: true,
      deduped: true,
      import_run_id: existing.data.import_run_id,
      imported_at: existing.data.imported_at,
    });
  }

  let importRunId: string | null = existing.data?.import_run_id ?? null;

  // 3) Parse XML
  const parser = new XMLParser({
    ignoreAttributes: true,
    trimValues: true,
    parseTagValue: true,
  });

  let parsed: any;
  try {
    parsed = parser.parse(xmlText);
  } catch (e) {
    return ok({ ok: false, step: "parse", error: String(e) });
  }

  const report = getCardReport(parsed);
  if (!report) {
    return ok({
      ok: false,
      step: "parse_structure",
      error: "Could not find CardReport in XML",
      top_level_keys: Object.keys(parsed ?? {}),
    });
  }

  const periodBegin = toIsoDate(report?.BeginDate ?? "");
  const periodEnd = toIsoDate(report?.EndDate ?? "");

  // 4) Create run if needed, else clear derived outputs on force
  if (!importRunId) {
    const runIns = await supabase
      .schema("raw")
      .from("payroll_import_runs")
      .insert({
        source: "kelly",
        bucket,
        storage_path: path,
        file_sha256: fileSha,
        period_begin: periodBegin,
        period_end: periodEnd,
      })
      .select("import_run_id")
      .single();

    if (runIns.error) return ok({ ok: false, step: "insert_import_run", error: runIns.error.message });
    importRunId = runIns.data.import_run_id as string;
  } else if (force) {
    const del1 = await supabase.schema("app").from("time_entries").delete().eq("import_run_id", importRunId);
    if (del1.error) return ok({ ok: false, step: "force_clear_time_entries", import_run_id: importRunId, error: del1.error.message });

    const del2 = await supabase.schema("raw").from("payroll_unmatched_employees").delete().eq("import_run_id", importRunId);
    if (del2.error) return ok({ ok: false, step: "force_clear_unmatched", import_run_id: importRunId, error: del2.error.message });
  }

  // 5) Build punches + rollup keyed by the most stable Kelly identity we have.
  // Prefer Kelly unique ID, then fall back to employee code for older records.
  const cards = asArray(report?.Cards?.Card ?? report?.Cards?.["Card"] ?? report?.["Cards"]?.["Card"]);

  const punchRows: any[] = [];
  const rollup = new Map<
    string,
    { reg: number; ot1: number; ot2: number; payrollKey: string; code?: string; uid?: string; name?: string }
  >();

  for (const card of cards) {
    const emp = card?.Employee;
    const punches = asArray(card?.Punches?.Punch);
    if (!emp || punches.length === 0) continue;

    const empCode = normKey(emp?.EmployeeCode);
    const empUid = normKey(emp?.UniqueID);
    const fullName = normKey(emp?.FullName);

    const payrollKey = normKey(empUid ?? empCode);
    if (!payrollKey) continue;

    for (const p of punches) {
      const kellyPunchId = String(p?.id ?? "").trim();
      const punchDateIso = toIsoDate(String(p?.PunchDate ?? "").trim());
      const inTs = toPgTimestamp(String(p?.InDT ?? "").trim());
      const outTs = toPgTimestamp(String(p?.OutDT ?? "").trim());

      const hours = num(p?.Hours);
      const nonOt = num(p?.NonOTHours);
      const ot1 = num(p?.OT1Hours);
      const ot2 = num(p?.OT2Hours);
      const lunchMin = p?.LunchMinutes != null ? num(p?.LunchMinutes) : null;

      punchRows.push({
        import_run_id: importRunId,
        kelly_punch_id: kellyPunchId,
        kelly_worker_key: payrollKey,
        kelly_employee_code: empCode,
        kelly_employee_unique_id: empUid,
        full_name: fullName,
        punch_date: punchDateIso,
        in_dt: inTs,
        out_dt: outTs,
        hours,
        non_ot_hours: nonOt,
        ot1_hours: ot1,
        ot2_hours: ot2,
        lunch_minutes: (lunchMin != null && Number.isFinite(lunchMin)) ? lunchMin : null,
      });

      if (punchDateIso) {
        const key = `${payrollKey}__${punchDateIso}`;
        const cur =
          rollup.get(key) ??
          {
            reg: 0,
            ot1: 0,
            ot2: 0,
            payrollKey,
            code: empCode ?? undefined,
            uid: empUid ?? undefined,
            name: fullName ?? undefined,
          };

        cur.reg += nonOt;
        cur.ot1 += ot1;
        cur.ot2 += ot2;
        rollup.set(key, cur);
      }
    }
  }

  if (punchRows.length === 0) {
    return ok({
      ok: true,
      import_run_id: importRunId,
      period_begin: periodBegin,
      period_end: periodEnd,
      punches_found: 0,
      time_entries: 0,
      unmatched_employees: 0,
      note: "No punches found. Check XML structure under CardReport/Cards/Card/Punches/Punch.",
    });
  }

  // 6) Upsert punches (dedupe per run by import_run_id + kelly_punch_id)
  const chunkSize = 500;
  let punchesInsertedAttempted = 0;

  for (let i = 0; i < punchRows.length; i += chunkSize) {
    const chunk = punchRows.slice(i, i + chunkSize);
    const ins = await supabase
      .schema("raw")
      .from("payroll_punches")
      .upsert(chunk, { onConflict: "import_run_id,kelly_punch_id" });

    if (ins.error) return ok({ ok: false, step: "upsert_punches", import_run_id: importRunId, error: ins.error.message });
    punchesInsertedAttempted += chunk.length;
  }

  // 7) Map the payroll identity we imported to consultant_id.
  const uniquePayrollKeys = Array.from(
    new Set(
      punchRows
        .map((r) => normKey(r.kelly_worker_key))
        .filter(Boolean) as string[]
    )
  );
  const consultantMap = new Map<string, string>();

  async function lookupConsultantsByField(keys: string[], field: "kelly_employee_unique_id" | "kelly_worker_key" | "kelly_employee_code") {
    const chunkSize = 200;
    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize);
      const q = await supabase
        .schema("app")
        .from("consultants")
        .select(`consultant_id, ${field}`)
        .in(field, chunk);

      if (q.error) {
        return { ok: false as const, error: q.error.message };
      }

      for (const row of q.data ?? []) {
        const k = normKey(row[field]);
        if (k && row.consultant_id) consultantMap.set(k, row.consultant_id);
      }
    }

    return { ok: true as const };
  }

  if (uniquePayrollKeys.length > 0) {
    const r1 = await lookupConsultantsByField(uniquePayrollKeys, "kelly_employee_unique_id");
    if (!r1.ok) {
      return ok({ ok: false, step: "lookup_consultants_by_unique_id", import_run_id: importRunId, error: r1.error });
    }
  }

  // Fall back to older identifiers for consultant records that have not been backfilled yet.
  const missingKeys = uniquePayrollKeys.filter((k) => !consultantMap.has(k));

  if (missingKeys.length > 0) {
    const r2 = await lookupConsultantsByField(missingKeys, "kelly_worker_key");
    if (!r2.ok) {
      return ok({ ok: false, step: "lookup_consultants_by_worker_key", import_run_id: importRunId, error: r2.error });
    }
  }

  const stillMissingKeys = uniquePayrollKeys.filter((k) => !consultantMap.has(k));
  if (stillMissingKeys.length > 0) {
    const r3 = await lookupConsultantsByField(stillMissingKeys, "kelly_employee_code");
    if (!r3.ok) {
      return ok({ ok: false, step: "lookup_consultants_by_employee_code", import_run_id: importRunId, error: r3.error });
    }
  }

  // 8) Upsert time entries (one per imported payroll identity/day/run)
  const timeRows: any[] = [];
  for (const [key, sums] of rollup.entries()) {
    const [payrollKey, serviceDate] = key.split("__");
    const consultantId = consultantMap.get(payrollKey) ?? null;

    timeRows.push({
      import_run_id: importRunId,
      consultant_id: consultantId,
      kelly_worker_key: payrollKey,
      kelly_employee_code: sums.code ?? null,
      kelly_employee_unique_id: sums.uid ?? null,
      service_date: serviceDate,
      reg_hours: sums.reg,
      ot_hours: sums.ot1,
      ot2_hours: sums.ot2,
      source: "kelly",
    });
  }

  for (let i = 0; i < timeRows.length; i += chunkSize) {
    const chunk = timeRows.slice(i, i + chunkSize);
    const ins = await supabase
      .schema("app")
      .from("time_entries")
      .upsert(chunk, {
        onConflict: "import_run_id,consultant_id,kelly_worker_key,service_date",
      });

    if (ins.error) return ok({ ok: false, step: "insert_time_entries", import_run_id: importRunId, error: ins.error.message });
  }

  // 9) Upsert unmatched by imported payroll identity
  const unmatchedAgg = new Map<string, { payrollKey: string; code?: string; uid?: string; name?: string; reg: number; ot1: number; ot2: number }>();

  for (const [key, sums] of rollup.entries()) {
    const [payrollKey] = key.split("__");
    if (consultantMap.has(payrollKey)) continue;

    const cur =
      unmatchedAgg.get(payrollKey) ??
      { payrollKey, code: sums.code, uid: sums.uid, name: sums.name, reg: 0, ot1: 0, ot2: 0 };

    cur.reg += sums.reg;
    cur.ot1 += sums.ot1;
    cur.ot2 += sums.ot2;
    unmatchedAgg.set(payrollKey, cur);
  }

  const unmatchedRows: any[] = [];
  for (const [, sums] of unmatchedAgg.entries()) {
    unmatchedRows.push({
      import_run_id: importRunId,
      kelly_worker_key: sums.payrollKey,
      kelly_employee_code: sums.code ?? null,
      kelly_employee_unique_id: sums.uid ?? null,
      full_name: sums.name ?? null,
      period_begin: periodBegin,
      period_end: periodEnd,
      total_reg_hours: sums.reg,
      total_ot_hours: sums.ot1,
      total_ot2_hours: sums.ot2,
    });
  }

  if (unmatchedRows.length > 0) {
    const ins = await supabase
      .schema("raw")
      .from("payroll_unmatched_employees")
      .upsert(unmatchedRows, { onConflict: "import_run_id,kelly_worker_key" });

    if (ins.error) return ok({ ok: false, step: "insert_unmatched", import_run_id: importRunId, error: ins.error.message });
  }

  return ok({
    ok: true,
    import_run_id: importRunId,
    period_begin: periodBegin,
    period_end: periodEnd,
    punches_found: punchRows.length,
    punches_inserted_attempted: punchesInsertedAttempted,
    time_entries: timeRows.length,
    unmatched_employees: unmatchedRows.length,
    consultant_keys_seen: uniquePayrollKeys.length,
    consultant_matches_found: consultantMap.size,
    consultant_keys_unmapped_sample: uniquePayrollKeys.filter((k) => !consultantMap.has(k)).slice(0, 10),
    forced_reprocess: force && Boolean(existing.data?.import_run_id),
  });
});
