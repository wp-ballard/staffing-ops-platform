// supabase/functions/payroll_xml_import/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@4";

type ImportRequest = {
  bucket: string;
  path: string;
  force?: boolean;
};

type RollupValue = {
  reg: number;
  ot1: number;
  ot2: number;
  pto: number;
  workerKey: string;
  code?: string;
  uid?: string;
  name?: string;
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

function badRequest(message: string) {
  return jsonResponse({ error: message }, 400);
}

function unauthorized() {
  return jsonResponse({ error: "Unauthorized" }, 401);
}

function forbidden() {
  return jsonResponse({ error: "Forbidden" }, 403);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toIsoDate(input: string): string | null {
  if (!input) return null;
  const s = String(input).trim();

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

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

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function num(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normKey(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
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

  if (req.method !== "POST") {
    return badRequest("Use POST");
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (!token) {
    return unauthorized();
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return badRequest("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return unauthorized();
  }

  const authUserId = userData.user.id;

  const staff = await supabase
    .schema("app")
    .from("staff_users")
    .select("staff_user_id, role_code, is_active")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (staff.error) {
    return jsonResponse({
      ok: false,
      step: "auth_staff_lookup",
      error: staff.error.message,
    });
  }

  if (!staff.data || !staff.data.is_active || staff.data.role_code !== "ADMIN") {
    return forbidden();
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

  if (!bucket || !path) {
    return badRequest("Missing bucket/path");
  }

  const downloadResult = await supabase.storage.from(bucket).download(path);
  if (downloadResult.error || !downloadResult.data) {
    return jsonResponse({
      ok: false,
      step: "download",
      error: downloadResult.error?.message ?? "download failed",
    });
  }

  const xmlText = await downloadResult.data.text();
  const xmlBytes = new TextEncoder().encode(xmlText);
  const fileSha = await sha256Hex(xmlBytes);

  const existing = await supabase
    .schema("raw")
    .from("payroll_import_runs")
    .select("import_run_id, imported_at")
    .eq("source", "kelly")
    .eq("file_sha256", fileSha)
    .maybeSingle();

  if (existing.error) {
    return jsonResponse({
      ok: false,
      step: "dedupe_lookup",
      error: existing.error.message,
    });
  }

  if (existing.data?.import_run_id && !force) {
    return jsonResponse({
      ok: true,
      deduped: true,
      import_run_id: existing.data.import_run_id,
      imported_at: existing.data.imported_at,
    });
  }

  let importRunId: string | null = existing.data?.import_run_id ?? null;

  const parser = new XMLParser({
    ignoreAttributes: true,
    trimValues: true,
    parseTagValue: true,
  });

  let parsed: any;
  try {
    parsed = parser.parse(xmlText);
  } catch (e) {
    return jsonResponse({
      ok: false,
      step: "parse",
      error: String(e),
    });
  }

  const report = getCardReport(parsed);
  if (!report) {
    return jsonResponse({
      ok: false,
      step: "parse_structure",
      error: "Could not find CardReport in XML",
      top_level_keys: Object.keys(parsed ?? {}),
    });
  }

  const periodBegin = toIsoDate(report?.BeginDate ?? "");
  const periodEnd = toIsoDate(report?.EndDate ?? "");

  if (!importRunId) {
    const runInsert = await supabase
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

    if (runInsert.error) {
      return jsonResponse({
        ok: false,
        step: "insert_import_run",
        error: runInsert.error.message,
      });
    }

    importRunId = runInsert.data.import_run_id as string;
  } else if (force) {
    const clearTimeEntries = await supabase
      .schema("app")
      .from("time_entries")
      .delete()
      .eq("import_run_id", importRunId);

    if (clearTimeEntries.error) {
      return jsonResponse({
        ok: false,
        step: "force_clear_time_entries",
        import_run_id: importRunId,
        error: clearTimeEntries.error.message,
      });
    }

    const clearUnmatched = await supabase
      .schema("raw")
      .from("payroll_unmatched_employees")
      .delete()
      .eq("import_run_id", importRunId);

    if (clearUnmatched.error) {
      return jsonResponse({
        ok: false,
        step: "force_clear_unmatched",
        import_run_id: importRunId,
        error: clearUnmatched.error.message,
      });
    }
  }

  const cards = asArray(
    report?.Cards?.Card ??
      report?.Cards?.["Card"] ??
      report?.["Cards"]?.["Card"],
  );

  const punchRows: any[] = [];
  const rollup = new Map<string, RollupValue>();

  for (const card of cards) {
    const emp = card?.Employee;
    const punches = asArray(card?.Punches?.Punch);
    if (!emp || punches.length === 0) continue;

    const empCode = normKey(emp?.EmployeeCode);
    const empUid = normKey(emp?.UniqueID);
    const fullName = normKey(emp?.FullName);
    const workerKey = normKey(empUid ?? empCode);

    if (!workerKey) continue;

    for (const punch of punches) {
      const kellyPunchId = String(punch?.id ?? "").trim();
      const punchDateIso = toIsoDate(String(punch?.PunchDate ?? "").trim());
      const inTs = toPgTimestamp(String(punch?.InDT ?? "").trim());
      const outTs = toPgTimestamp(String(punch?.OutDT ?? "").trim());
      const category = normKey(punch?.Category);
      const isPto = (category ?? "").toUpperCase() === "PTO";
      const hours = num(punch?.Hours);
      const nonOt = num(punch?.NonOTHours);
      const ot1 = num(punch?.OT1Hours);
      const ot2 = num(punch?.OT2Hours);
      const lunchMin = punch?.LunchMinutes != null
        ? num(punch?.LunchMinutes)
        : null;

      punchRows.push({
        import_run_id: importRunId,
        kelly_punch_id: kellyPunchId,
        kelly_worker_key: workerKey,
        kelly_employee_code: empCode,
        kelly_employee_unique_id: empUid,
        full_name: fullName,
        punch_date: punchDateIso,
        in_dt: inTs,
        out_dt: outTs,
        category,
        hours,
        non_ot_hours: nonOt,
        ot1_hours: ot1,
        ot2_hours: ot2,
        lunch_minutes:
          lunchMin != null && Number.isFinite(lunchMin) ? lunchMin : null,
      });

      if (punchDateIso) {
        const key = `${workerKey}__${punchDateIso}`;
        const current = rollup.get(key) ?? {
          reg: 0,
          ot1: 0,
          ot2: 0,
          pto: 0,
          workerKey,
          code: empCode ?? undefined,
          uid: empUid ?? undefined,
          name: fullName ?? undefined,
        };

        if (isPto) {
          const ptoHours = hours || nonOt || 0;
          current.pto += ptoHours;
        } else {
          current.reg += nonOt;
          current.ot1 += ot1;
          current.ot2 += ot2;
        }

        rollup.set(key, current);
      }
    }
  }

  if (punchRows.length === 0) {
    return jsonResponse({
      ok: true,
      import_run_id: importRunId,
      period_begin: periodBegin,
      period_end: periodEnd,
      punches_found: 0,
      time_entries: 0,
      unmatched_employees: 0,
      note:
        "No punches found. Check XML structure under CardReport/Cards/Card/Punches/Punch.",
    });
  }

  const chunkSize = 500;
  let punchesInsertedAttempted = 0;

  for (let i = 0; i < punchRows.length; i += chunkSize) {
    const chunk = punchRows.slice(i, i + chunkSize);
    const upsertPunches = await supabase
      .schema("raw")
      .from("payroll_punches")
      .upsert(chunk, { onConflict: "import_run_id,kelly_punch_id" });

    if (upsertPunches.error) {
      return jsonResponse({
        ok: false,
        step: "upsert_punches",
        import_run_id: importRunId,
        error: upsertPunches.error.message,
      });
    }

    punchesInsertedAttempted += chunk.length;
  }

  const uniqueWorkerKeys = Array.from(
    new Set(
      punchRows
        .map((row) => normKey(row.kelly_worker_key))
        .filter(Boolean) as string[],
    ),
  );

  const consultantMap = new Map<string, string>();

  async function lookupConsultantsByKeys(keys: string[]) {
    const queryChunkSize = 200;

    for (let i = 0; i < keys.length; i += queryChunkSize) {
      const chunk = keys.slice(i, i + queryChunkSize);
      const query = await supabase
        .schema("app")
        .from("consultants")
        .select("consultant_id, kelly_worker_key")
        .in("kelly_worker_key", chunk);

      if (query.error) {
        return { ok: false as const, error: query.error.message };
      }

      for (const row of query.data ?? []) {
        const key = normKey(row.kelly_worker_key);
        if (key && row.consultant_id) {
          consultantMap.set(key, row.consultant_id);
        }
      }
    }

    return { ok: true as const };
  }

  if (uniqueWorkerKeys.length > 0) {
    const result = await lookupConsultantsByKeys(uniqueWorkerKeys);
    if (!result.ok) {
      return jsonResponse({
        ok: false,
        step: "lookup_consultants_by_worker_key",
        import_run_id: importRunId,
        error: result.error,
      });
    }
  }

  const missingKeys = uniqueWorkerKeys.filter((key) => !consultantMap.has(key));

  if (missingKeys.length > 0) {
    for (let i = 0; i < missingKeys.length; i += 200) {
      const chunk = missingKeys.slice(i, i + 200);
      const query = await supabase
        .schema("app")
        .from("consultants")
        .select("consultant_id, kelly_employee_code")
        .in("kelly_employee_code", chunk);

      if (query.error) {
        return jsonResponse({
          ok: false,
          step: "lookup_consultants_by_employee_code",
          import_run_id: importRunId,
          error: query.error.message,
        });
      }

      for (const row of query.data ?? []) {
        const key = normKey(row.kelly_employee_code);
        if (key && row.consultant_id && !consultantMap.has(key)) {
          consultantMap.set(key, row.consultant_id);
        }
      }
    }

    for (let i = 0; i < missingKeys.length; i += 200) {
      const chunk = missingKeys.slice(i, i + 200);
      const query = await supabase
        .schema("app")
        .from("consultants")
        .select("consultant_id, kelly_employee_unique_id")
        .in("kelly_employee_unique_id", chunk);

      if (query.error) {
        return jsonResponse({
          ok: false,
          step: "lookup_consultants_by_unique_id",
          import_run_id: importRunId,
          error: query.error.message,
        });
      }

      for (const row of query.data ?? []) {
        const key = normKey(row.kelly_employee_unique_id);
        if (key && row.consultant_id && !consultantMap.has(key)) {
          consultantMap.set(key, row.consultant_id);
        }
      }
    }
  }

  const timeRows: any[] = [];

  for (const [key, sums] of rollup.entries()) {
    const [workerKey, serviceDate] = key.split("__");
    const consultantId = consultantMap.get(workerKey) ?? null;

    timeRows.push({
      import_run_id: importRunId,
      consultant_id: consultantId,
      kelly_worker_key: workerKey,
      kelly_employee_code: sums.code ?? null,
      kelly_employee_unique_id: sums.uid ?? null,
      service_date: serviceDate,
      reg_hours: sums.reg,
      ot_hours: sums.ot1,
      ot2_hours: sums.ot2,
      pto_hours: sums.pto,
      source: "kelly",
    });
  }

  for (let i = 0; i < timeRows.length; i += chunkSize) {
    const chunk = timeRows.slice(i, i + chunkSize);
    const upsertTimeEntries = await supabase
      .schema("app")
      .from("time_entries")
      .upsert(chunk, {
        onConflict: "import_run_id,kelly_worker_key,service_date",
      });

    if (upsertTimeEntries.error) {
      return jsonResponse({
        ok: false,
        step: "insert_time_entries",
        import_run_id: importRunId,
        error: upsertTimeEntries.error.message,
      });
    }
  }

  const unmatchedAgg = new Map<
    string,
    {
      workerKey: string;
      code?: string;
      uid?: string;
      name?: string;
      reg: number;
      ot1: number;
      ot2: number;
    }
  >();

  for (const [key, sums] of rollup.entries()) {
    const [workerKey] = key.split("__");
    if (consultantMap.has(workerKey)) continue;

    const current = unmatchedAgg.get(workerKey) ?? {
      workerKey,
      code: sums.code,
      uid: sums.uid,
      name: sums.name,
      reg: 0,
      ot1: 0,
      ot2: 0,
    };

    current.reg += sums.reg;
    current.ot1 += sums.ot1;
    current.ot2 += sums.ot2;
    unmatchedAgg.set(workerKey, current);
  }

  const unmatchedRows: any[] = [];

  for (const [, sums] of unmatchedAgg.entries()) {
    unmatchedRows.push({
      import_run_id: importRunId,
      kelly_worker_key: sums.workerKey,
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
    const upsertUnmatched = await supabase
      .schema("raw")
      .from("payroll_unmatched_employees")
      .upsert(unmatchedRows, {
        onConflict: "import_run_id,kelly_worker_key",
      });

    if (upsertUnmatched.error) {
      return jsonResponse({
        ok: false,
        step: "insert_unmatched",
        import_run_id: importRunId,
        error: upsertUnmatched.error.message,
      });
    }
  }

  return jsonResponse({
    ok: true,
    import_run_id: importRunId,
    period_begin: periodBegin,
    period_end: periodEnd,
    punches_found: punchRows.length,
    punches_inserted_attempted: punchesInsertedAttempted,
    time_entries: timeRows.length,
    unmatched_employees: unmatchedRows.length,
    consultant_keys_seen: uniqueWorkerKeys.length,
    consultant_matches_found: consultantMap.size,
    consultant_keys_unmapped_sample: uniqueWorkerKeys
      .filter((key) => !consultantMap.has(key))
      .slice(0, 10),
    forced_reprocess: force && Boolean(existing.data?.import_run_id),
  });
});
