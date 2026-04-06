--
-- PostgreSQL database dump
--
-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.2

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app;


--
-- Name: raw; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA raw;


--
-- Name: stg; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA stg;


--
-- Name: build_invoices_from_active_run(boolean, text, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.build_invoices_from_active_run(force boolean DEFAULT false, default_terms text DEFAULT 'net 30'::text, terms_days integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
declare
  v_run_id uuid;
  v_begin date;
  v_end date;
  v_invoice_date date;
  v_due_date date;

  v_created_invoices int := 0;
  v_created_lines int := 0;
  v_deleted_lines int := 0;
  v_rc int := 0;
begin
  -- 1) Active run
  select import_run_id, period_begin, period_end
    into v_run_id, v_begin, v_end
  from raw.payroll_import_runs
  where is_active_for_period = true
  limit 1;

  if v_run_id is null then
    return jsonb_build_object('ok', false, 'error', 'No active payroll import run found.');
  end if;

  if v_begin is null or v_end is null then
    return jsonb_build_object('ok', false, 'error', 'Active run is missing period_begin/period_end.');
  end if;

  -- Invoice date: first day of next month (Dec service -> Jan 1 invoice)
  v_invoice_date := (date_trunc('month', v_end)::date + interval '1 month')::date;
  v_due_date := (v_invoice_date + (terms_days || ' days')::interval)::date;

  -- 2) Block build if any time entries are missing an assignment
  if exists (
    select 1
    from app.time_entries te
    join raw.payroll_import_runs r on r.import_run_id = te.import_run_id and r.is_active_for_period = true
    left join app.consultant_po_assignments a
      on a.consultant_id = te.consultant_id
     and te.service_date >= a.assignment_start_date
     and (a.assignment_end_date is null or te.service_date <= a.assignment_end_date)
    where a.assignment_id is null
    limit 1
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Some time entries do not match an assignment for the active run. Fix assignments first.'
    );
  end if;

  -- 3) Create invoices (one per customer present in billable data)
  with billable_customers as (
    select distinct po.customer_id
    from app.time_entries te
    join raw.payroll_import_runs r
      on r.import_run_id = te.import_run_id
     and r.is_active_for_period = true
    join app.consultant_po_assignments a
      on a.consultant_id = te.consultant_id
     and te.service_date >= a.assignment_start_date
     and (a.assignment_end_date is null or te.service_date <= a.assignment_end_date)
    join app.purchase_orders po
      on po.purchase_order_id = a.purchase_order_id
  )
  insert into app.invoices (
    import_run_id, customer_id,
    period_begin, period_end,
    invoice_date, due_date, terms,
    status,
    invoice_no
  )
  select
    v_run_id,
    bc.customer_id,
    v_begin, v_end,
    v_invoice_date, v_due_date, default_terms,
    'draft',
    app.make_invoice_no(v_end)
  from billable_customers bc
  where not exists (
    select 1
    from app.invoices i
    where i.import_run_id = v_run_id
      and i.customer_id = bc.customer_id
  );

  get diagnostics v_rc = row_count;
  v_created_invoices := v_created_invoices + v_rc;

  -- 4) If force=true, wipe existing DRAFT lines for this run
  if force then
    delete from app.invoice_lines il
    using app.invoices i
    where il.invoice_id = i.invoice_id
      and i.import_run_id = v_run_id
      and i.status = 'draft';

    get diagnostics v_rc = row_count;
    v_deleted_lines := v_deleted_lines + v_rc;
  end if;

  -- 5) Insert invoice lines (daily per consultant per PO)

  -- Regular
  insert into app.invoice_lines (
    invoice_id,
    purchase_order_id,
    consultant_id,
    service_date,
    service_date_begin,
    service_date_end,
    reg_hours,
    ot_hours,
    ot2_hours,
    bill_rate_regular,
    bill_rate_overtime,
    line_description,
    amount
  )
  select
    i.invoice_id,
    po.purchase_order_id,
    te.consultant_id,
    te.service_date,
    te.service_date,
    te.service_date,
    te.reg_hours,
    0, 0,
    a.bill_rate_regular,
    a.bill_rate_overtime,
    coalesce(nullif(con.display_name,''), con.consultant_id::text) || ' - Regular Rate',
    round(te.reg_hours * coalesce(a.bill_rate_regular, 0), 2)
  from app.time_entries te
  join raw.payroll_import_runs r
    on r.import_run_id = te.import_run_id
   and r.is_active_for_period = true
  join app.consultant_po_assignments a
    on a.consultant_id = te.consultant_id
   and te.service_date >= a.assignment_start_date
   and (a.assignment_end_date is null or te.service_date <= a.assignment_end_date)
  join app.purchase_orders po
    on po.purchase_order_id = a.purchase_order_id
  join app.invoices i
    on i.import_run_id = te.import_run_id
   and i.customer_id = po.customer_id
   and i.status = 'draft'
  join app.consultants con
    on con.consultant_id = te.consultant_id
  where te.reg_hours > 0;

  get diagnostics v_rc = row_count;
  v_created_lines := v_created_lines + v_rc;

  -- OT1
  insert into app.invoice_lines (
    invoice_id, purchase_order_id, consultant_id,
    service_date, service_date_begin, service_date_end,
    reg_hours, ot_hours, ot2_hours,
    bill_rate_regular, bill_rate_overtime,
    line_description, amount
  )
  select
    i.invoice_id,
    po.purchase_order_id,
    te.consultant_id,
    te.service_date,
    te.service_date,
    te.service_date,
    0, te.ot_hours, 0,
    a.bill_rate_regular,
    a.bill_rate_overtime,
    coalesce(nullif(con.display_name,''), con.consultant_id::text) || ' - Overtime Rate',
    round(te.ot_hours * coalesce(a.bill_rate_overtime, a.bill_rate_regular, 0), 2)
  from app.time_entries te
  join raw.payroll_import_runs r
    on r.import_run_id = te.import_run_id
   and r.is_active_for_period = true
  join app.consultant_po_assignments a
    on a.consultant_id = te.consultant_id
   and te.service_date >= a.assignment_start_date
   and (a.assignment_end_date is null or te.service_date <= a.assignment_end_date)
  join app.purchase_orders po
    on po.purchase_order_id = a.purchase_order_id
  join app.invoices i
    on i.import_run_id = te.import_run_id
   and i.customer_id = po.customer_id
   and i.status = 'draft'
  join app.consultants con
    on con.consultant_id = te.consultant_id
  where te.ot_hours > 0;

  get diagnostics v_rc = row_count;
  v_created_lines := v_created_lines + v_rc;

  -- OT2 (treated like OT)
  insert into app.invoice_lines (
    invoice_id, purchase_order_id, consultant_id,
    service_date, service_date_begin, service_date_end,
    reg_hours, ot_hours, ot2_hours,
    bill_rate_regular, bill_rate_overtime,
    line_description, amount
  )
  select
    i.invoice_id,
    po.purchase_order_id,
    te.consultant_id,
    te.service_date,
    te.service_date,
    te.service_date,
    0, 0, te.ot2_hours,
    a.bill_rate_regular,
    a.bill_rate_overtime,
    coalesce(nullif(con.display_name,''), con.consultant_id::text) || ' - Overtime Rate',
    round(te.ot2_hours * coalesce(a.bill_rate_overtime, a.bill_rate_regular, 0), 2)
  from app.time_entries te
  join raw.payroll_import_runs r
    on r.import_run_id = te.import_run_id
   and r.is_active_for_period = true
  join app.consultant_po_assignments a
    on a.consultant_id = te.consultant_id
   and te.service_date >= a.assignment_start_date
   and (a.assignment_end_date is null or te.service_date <= a.assignment_end_date)
  join app.purchase_orders po
    on po.purchase_order_id = a.purchase_order_id
  join app.invoices i
    on i.import_run_id = te.import_run_id
   and i.customer_id = po.customer_id
   and i.status = 'draft'
  join app.consultants con
    on con.consultant_id = te.consultant_id
  where te.ot2_hours > 0;

  get diagnostics v_rc = row_count;
  v_created_lines := v_created_lines + v_rc;

  return jsonb_build_object(
    'ok', true,
    'active_import_run_id', v_run_id,
    'period_begin', v_begin,
    'period_end', v_end,
    'invoice_date', v_invoice_date,
    'due_date', v_due_date,
    'invoices_created', v_created_invoices,
    'lines_deleted', v_deleted_lines,
    'lines_created', v_created_lines
  );
end;
$$;


--
-- Name: clear_active_payroll_import_run(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.clear_active_payroll_import_run(p_import_run_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'raw', 'app', 'public'
    AS $$
begin
  update raw.payroll_import_runs
  set is_active_for_period = false
  where import_run_id = p_import_run_id;
end;
$$;


--
-- Name: current_staff_user_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_staff_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
  select su.staff_user_id
  from app.staff_users su
  where su.auth_user_id = auth.uid()
    and su.is_active = true
  limit 1;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
  select exists (
    select 1
    from app.staff_users su
    where su.auth_user_id = auth.uid()
      and su.is_active = true
      and upper(su.role_code) = 'ADMIN'
  );
$$;


--
-- Name: link_staff_user_on_auth_signup(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.link_staff_user_on_auth_signup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
begin
  -- Only link for email/password users with an email
  if new.email is null then
    return new;
  end if;

  -- Only allow signup if they already exist in app.staff_users (pre-approved staff)
  update app.staff_users su
     set auth_user_id = new.id
   where lower(su.email) = lower(new.email)
     and su.is_active = true
     and su.auth_user_id is null;

  -- If no row was updated, block signup (internal-only control)
  if not found then
    raise exception 'Not an approved staff user';
  end if;

  return new;
end;
$$;


--
-- Name: make_invoice_no(date); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.make_invoice_no(period_end date) RETURNS text
    LANGUAGE sql
    AS $$
  select to_char(period_end, 'YYYYMM') || '-' || lpad(nextval('app.invoice_number_seq')::text, 4, '0');
$$;


--
-- Name: set_active_payroll_import_run(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_active_payroll_import_run(p_import_run_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'raw', 'app', 'public'
    AS $$
declare
  v_begin date;
  v_end   date;
begin
  select period_begin, period_end
    into v_begin, v_end
  from raw.payroll_import_runs
  where import_run_id = p_import_run_id;

  if v_begin is null or v_end is null then
    raise exception 'Import run % is missing period_begin/period_end', p_import_run_id;
  end if;

  -- turn off any other active run for the same period (same begin/end)
  update raw.payroll_import_runs
  set is_active_for_period = false
  where source = 'kelly'
    and period_begin = v_begin
    and period_end = v_end
    and import_run_id <> p_import_run_id;

  -- turn this one on
  update raw.payroll_import_runs
  set is_active_for_period = true
  where import_run_id = p_import_run_id;
end;
$$;


--
-- Name: set_active_payroll_run(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_active_payroll_run(p_import_run_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_begin date;
  v_end date;
begin
  select period_begin, period_end
    into v_begin, v_end
  from raw.payroll_import_runs
  where import_run_id = p_import_run_id;

  if v_begin is null or v_end is null then
    raise exception 'import_run_id not found: %', p_import_run_id;
  end if;

  -- Deactivate others in same period
  update raw.payroll_import_runs
    set is_active_for_period = false
  where period_begin = v_begin
    and period_end = v_end
    and is_active_for_period = true;

  -- Activate selected
  update raw.payroll_import_runs
    set is_active_for_period = true
  where import_run_id = p_import_run_id;
end;
$$;


--
-- Name: set_assignment_billing_override(uuid, date, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_assignment_billing_override(p_assignment_id uuid, p_bill_through date, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  update app.consultant_po_assignments
  set billing_end_date_override = p_bill_through,
      billing_note = coalesce(p_note, billing_note),
      updated_at = now()
  where assignment_id = p_assignment_id
    and deleted_at is null;
end;
$$;


--
-- Name: set_consultant_display_name(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_consultant_display_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.display_name is null or btrim(new.display_name) = '' then
    new.display_name :=
      nullif(btrim(coalesce(new.first_name,'') || ' ' || coalesce(new.last_name,'')), '');
  end if;

  return new;
end;
$$;


--
-- Name: set_consultant_display_name_default(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_consultant_display_name_default() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- If user didn't provide a preferred name, default it to "First Last"
  if new.display_name is null or btrim(new.display_name) = '' then
    new.display_name :=
      nullif(btrim(coalesce(new.first_name,'') || ' ' || coalesce(new.last_name,'')), '');
  end if;

  return new;
end;
$$;


--
-- Name: set_inactive_payroll_import_run(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_inactive_payroll_import_run(p_import_run_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'app', 'raw', 'public'
    AS $$
declare
  v_begin date;
  v_end   date;
begin
  select period_begin, period_end
    into v_begin, v_end
  from raw.payroll_import_runs
  where import_run_id = p_import_run_id;

  if v_begin is null or v_end is null then
    raise exception 'Import run % is missing period_begin/period_end', p_import_run_id;
  end if;

  update raw.payroll_import_runs
  set is_active_for_period = false
  where import_run_id = p_import_run_id;
end;
$$;


--
-- Name: set_invoice_period_key(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_invoice_period_key() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- prefer invoice period_begin if present
  if new.period_begin is not null then
    new.period_key := to_char(new.period_begin, 'YYYY-MM');
  else
    new.period_key := null;
  end if;

  return new;
end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: soft_delete_consultant_assignment(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.soft_delete_consultant_assignment(p_assignment_id uuid, p_delete_reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'app', 'public'
    AS $$
declare
  v_auth_user_id uuid;
begin
  v_auth_user_id := auth.uid();

  update app.consultant_po_assignments
  set
    deleted_at = now(),
    deleted_by = v_auth_user_id,
    delete_reason = nullif(trim(p_delete_reason), ''),
    updated_at = now(),
    updated_by = v_auth_user_id
  where assignment_id = p_assignment_id
    and deleted_at is null;

  if not found then
    raise exception 'Assignment not found or already deleted';
  end if;
end;
$$;


--
-- Name: set_payroll_import_run_period_key(); Type: FUNCTION; Schema: raw; Owner: -
--

CREATE FUNCTION raw.set_payroll_import_run_period_key() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.period_begin is not null then
    new.period_key := to_char(new.period_begin, 'YYYY-MM');
  end if;
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: consultant_po_assignments; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.consultant_po_assignments (
    assignment_id uuid DEFAULT gen_random_uuid() NOT NULL,
    consultant_id uuid NOT NULL,
    purchase_order_id uuid NOT NULL,
    assignment_start_date date NOT NULL,
    assignment_end_date date,
    pay_rate_regular numeric(12,2),
    pay_rate_overtime numeric(12,2),
    bill_rate_regular numeric(12,2),
    bill_rate_overtime numeric(12,2),
    benefits_cost numeric(12,2),
    total_burden numeric(12,2),
    pto_billable boolean,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    delete_reason text,
    active_date_range daterange GENERATED ALWAYS AS (
CASE
    WHEN (deleted_at IS NULL) THEN daterange(assignment_start_date, COALESCE(assignment_end_date, 'infinity'::date), '[]'::text)
    ELSE NULL::daterange
END) STORED,
    billing_end_date_override date,
    billing_note text
);


--
-- Name: customers; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.customers (
    customer_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    street_address_line_1 text,
    street_address_line_2 text,
    city text,
    state text,
    zip text,
    note text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: purchase_orders; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.purchase_orders (
    purchase_order_id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    project_name text,
    purchase_order_number text,
    amount numeric(12,2),
    start_date date,
    end_date date,
    notes text,
    primary_document_path text,
    pre_pay boolean DEFAULT false NOT NULL,
    tracking_active boolean DEFAULT true NOT NULL,
    manager_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    location_id uuid,
    is_stub boolean DEFAULT false NOT NULL,
    stub_note text
);


--
-- Name: time_entries; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.time_entries (
    time_entry_id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_run_id uuid NOT NULL,
    consultant_id uuid,
    kelly_employee_unique_id text,
    service_date date NOT NULL,
    reg_hours numeric(10,2) DEFAULT 0 NOT NULL,
    ot_hours numeric(10,2) DEFAULT 0 NOT NULL,
    ot2_hours numeric(10,2) DEFAULT 0 NOT NULL,
    source text DEFAULT 'kelly'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    kelly_employee_code text,
    kelly_worker_key text NOT NULL,
    pto_hours numeric(10,2) DEFAULT 0 NOT NULL
);


--
-- Name: payroll_import_runs; Type: TABLE; Schema: raw; Owner: -
--

CREATE TABLE raw.payroll_import_runs (
    import_run_id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text DEFAULT 'kelly'::text NOT NULL,
    bucket text NOT NULL,
    storage_path text NOT NULL,
    file_sha256 text NOT NULL,
    period_begin date,
    period_end date,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active_for_period boolean DEFAULT false NOT NULL,
    period_key text
);


--
-- Name: billable_time_active_run_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.billable_time_active_run_view AS
 SELECT te.import_run_id,
    te.service_date,
    te.consultant_id,
    a.assignment_id,
    a.purchase_order_id,
    po.purchase_order_number,
    po.project_name,
    po.customer_id,
    c.name AS customer_name,
    te.reg_hours,
    te.ot_hours,
    te.ot2_hours,
    a.bill_rate_regular,
    a.bill_rate_overtime,
    (te.reg_hours * COALESCE(a.bill_rate_regular, (0)::numeric)) AS reg_amount,
    (te.ot_hours * COALESCE(a.bill_rate_overtime, COALESCE(a.bill_rate_regular, (0)::numeric))) AS ot_amount,
    (te.ot2_hours * COALESCE(a.bill_rate_overtime, COALESCE(a.bill_rate_regular, (0)::numeric))) AS ot2_amount,
    (((te.reg_hours * COALESCE(a.bill_rate_regular, (0)::numeric)) + (te.ot_hours * COALESCE(a.bill_rate_overtime, COALESCE(a.bill_rate_regular, (0)::numeric)))) + (te.ot2_hours * COALESCE(a.bill_rate_overtime, COALESCE(a.bill_rate_regular, (0)::numeric)))) AS total_amount
   FROM ((((app.time_entries te
     JOIN raw.payroll_import_runs r ON (((r.import_run_id = te.import_run_id) AND (r.is_active_for_period = true))))
     JOIN app.consultant_po_assignments a ON (((a.consultant_id = te.consultant_id) AND (te.service_date >= a.assignment_start_date) AND ((a.assignment_end_date IS NULL) OR (te.service_date <= a.assignment_end_date)))))
     JOIN app.purchase_orders po ON ((po.purchase_order_id = a.purchase_order_id)))
     JOIN app.customers c ON ((c.customer_id = po.customer_id)));


--
-- Name: billable_time_by_run_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.billable_time_by_run_view AS
 SELECT te.import_run_id,
    te.service_date,
    te.consultant_id,
    a.assignment_id,
    a.purchase_order_id,
    po.purchase_order_number,
    po.project_name,
    po.customer_id,
    c.name AS customer_name,
    te.reg_hours,
    te.ot_hours,
    te.ot2_hours,
    a.bill_rate_regular,
    a.bill_rate_overtime,
    (te.reg_hours * COALESCE(a.bill_rate_regular, (0)::numeric)) AS reg_amount,
    (te.ot_hours * COALESCE(a.bill_rate_overtime, COALESCE(a.bill_rate_regular, (0)::numeric))) AS ot_amount,
    (te.ot2_hours * COALESCE(a.bill_rate_overtime, COALESCE(a.bill_rate_regular, (0)::numeric))) AS ot2_amount,
    (((te.reg_hours * COALESCE(a.bill_rate_regular, (0)::numeric)) + (te.ot_hours * COALESCE(a.bill_rate_overtime, COALESCE(a.bill_rate_regular, (0)::numeric)))) + (te.ot2_hours * COALESCE(a.bill_rate_overtime, COALESCE(a.bill_rate_regular, (0)::numeric)))) AS total_amount
   FROM (((app.time_entries te
     LEFT JOIN LATERAL ( SELECT a_1.assignment_id,
            a_1.consultant_id,
            a_1.purchase_order_id,
            a_1.assignment_start_date,
            a_1.assignment_end_date,
            a_1.pay_rate_regular,
            a_1.pay_rate_overtime,
            a_1.bill_rate_regular,
            a_1.bill_rate_overtime,
            a_1.benefits_cost,
            a_1.total_burden,
            a_1.pto_billable AS pto_eligible,
            a_1.notes,
            a_1.created_at,
            a_1.created_by,
            a_1.updated_at,
            a_1.updated_by,
            a_1.deleted_at,
            a_1.deleted_by,
            a_1.delete_reason,
            a_1.active_date_range,
            a_1.billing_end_date_override,
            a_1.billing_note
           FROM app.consultant_po_assignments a_1
          WHERE ((a_1.deleted_at IS NULL) AND (a_1.consultant_id = te.consultant_id) AND (a_1.assignment_start_date <= te.service_date) AND ((COALESCE(a_1.billing_end_date_override, a_1.assignment_end_date) IS NULL) OR (COALESCE(a_1.billing_end_date_override, a_1.assignment_end_date) >= te.service_date)))
          ORDER BY a_1.assignment_start_date DESC, a_1.created_at DESC
         LIMIT 1) a ON (true))
     LEFT JOIN app.purchase_orders po ON ((po.purchase_order_id = a.purchase_order_id)))
     LEFT JOIN app.customers c ON ((c.customer_id = po.customer_id)));


--
-- Name: color_palette; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.color_palette (
    hex text NOT NULL,
    basic_name text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: consultants; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.consultants (
    consultant_id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_consultant_id text,
    first_name text,
    last_name text,
    email text,
    phone text,
    kelly_employee_unique_id text,
    kelly_employee_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kelly_worker_key text,
    display_name text,
    employment_start_date date,
    employment_end_date date,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: consultant_payroll_hours_by_run_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.consultant_payroll_hours_by_run_view AS
 SELECT te.import_run_id,
    te.consultant_id,
    COALESCE(c.display_name, TRIM(BOTH FROM concat_ws(' '::text, c.first_name, c.last_name)), 'Unmapped consultant'::text) AS consultant_name,
    te.kelly_employee_unique_id,
    te.kelly_employee_code,
    te.kelly_worker_key,
    sum(COALESCE(te.reg_hours, (0)::numeric)) AS reg_hours,
    sum(COALESCE(te.ot_hours, (0)::numeric)) AS ot_hours,
    sum(COALESCE(te.ot2_hours, (0)::numeric)) AS ot2_hours,
    sum(((COALESCE(te.reg_hours, (0)::numeric) + COALESCE(te.ot_hours, (0)::numeric)) + COALESCE(te.ot2_hours, (0)::numeric))) AS total_hours,
    count(*) AS time_entry_rows,
    count(DISTINCT te.service_date) AS service_days,
    min(te.service_date) AS first_service_date,
    max(te.service_date) AS last_service_date
   FROM (app.time_entries te
     LEFT JOIN app.consultants c ON ((c.consultant_id = te.consultant_id)))
  GROUP BY te.import_run_id, te.consultant_id, c.display_name, c.first_name, c.last_name, te.kelly_employee_unique_id, te.kelly_employee_code, te.kelly_worker_key;


--
-- Name: latest_payroll_run_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.latest_payroll_run_view AS
 SELECT import_run_id,
    source,
    period_begin,
    period_end,
    imported_at,
    bucket,
    storage_path,
    file_sha256,
    is_active_for_period,
    period_key
   FROM raw.payroll_import_runs r
  WHERE (period_end IS NOT NULL)
  ORDER BY period_end DESC, imported_at DESC, import_run_id DESC
 LIMIT 1;


--
-- Name: consultant_payroll_hours_active_run_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.consultant_payroll_hours_active_run_view AS
 SELECT h.import_run_id,
    h.consultant_id,
    h.consultant_name,
    h.kelly_employee_unique_id,
    h.kelly_employee_code,
    h.kelly_worker_key,
    h.reg_hours,
    h.ot_hours,
    h.ot2_hours,
    h.total_hours,
    h.time_entry_rows,
    h.service_days,
    h.first_service_date,
    h.last_service_date
   FROM (app.consultant_payroll_hours_by_run_view h
     JOIN app.latest_payroll_run_view lr ON ((lr.import_run_id = h.import_run_id)));


--
-- Name: consultants_active_payroll_status_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.consultants_active_payroll_status_view AS
 WITH latest_run AS (
         SELECT latest_payroll_run_view.import_run_id,
            latest_payroll_run_view.period_begin,
            latest_payroll_run_view.period_end
           FROM app.latest_payroll_run_view
        ), hours AS (
         SELECT te.consultant_id,
            sum(((COALESCE(te.reg_hours, (0)::numeric) + COALESCE(te.ot_hours, (0)::numeric)) + COALESCE(te.ot2_hours, (0)::numeric))) AS total_hours
           FROM (app.time_entries te
             JOIN latest_run lr_1 ON ((lr_1.import_run_id = te.import_run_id)))
          WHERE (te.consultant_id IS NOT NULL)
          GROUP BY te.consultant_id
        )
 SELECT c.consultant_id,
    c.display_name,
    c.first_name,
    c.last_name,
    c.kelly_employee_unique_id,
    c.kelly_employee_code,
    c.kelly_worker_key,
    c.is_active AS is_active_flag,
    ((h.total_hours IS NOT NULL) AND (h.total_hours > (0)::numeric)) AS has_hours_in_active_run,
    COALESCE(h.total_hours, (0)::numeric) AS active_run_hours,
    lr.import_run_id AS active_import_run_id,
    lr.period_begin,
    lr.period_end
   FROM ((app.consultants c
     CROSS JOIN latest_run lr)
     LEFT JOIN hours h ON ((h.consultant_id = c.consultant_id)));


--
-- Name: consultants_current_assignment_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.consultants_current_assignment_view AS
 SELECT c.consultant_id,
    COALESCE(NULLIF(c.display_name, ''::text), concat_ws(' '::text, c.first_name, c.last_name), NULLIF(c.kelly_worker_key, ''::text), NULLIF(c.kelly_employee_code, ''::text), (c.consultant_id)::text) AS consultant_name,
    a.assignment_id,
    a.purchase_order_id,
    po.purchase_order_number,
    po.project_name,
    po.customer_id,
    cust.name AS customer_name,
    a.assignment_start_date,
    a.assignment_end_date,
    a.pay_rate_regular,
    a.pay_rate_overtime,
    a.bill_rate_regular,
    a.bill_rate_overtime
   FROM (((app.consultants c
     LEFT JOIN LATERAL ( SELECT a_1.assignment_id,
            a_1.consultant_id,
            a_1.purchase_order_id,
            a_1.assignment_start_date,
            a_1.assignment_end_date,
            a_1.billing_end_date_override,
            a_1.pay_rate_regular,
            a_1.pay_rate_overtime,
            a_1.bill_rate_regular,
            a_1.bill_rate_overtime,
            a_1.created_at
           FROM app.consultant_po_assignments a_1
          WHERE ((a_1.deleted_at IS NULL) AND (a_1.consultant_id = c.consultant_id) AND (a_1.assignment_start_date <= CURRENT_DATE) AND ((COALESCE(a_1.billing_end_date_override, a_1.assignment_end_date) IS NULL) OR (COALESCE(a_1.billing_end_date_override, a_1.assignment_end_date) >= CURRENT_DATE)))
          ORDER BY a_1.assignment_start_date DESC, a_1.created_at DESC
         LIMIT 1) a ON (true))
     LEFT JOIN app.purchase_orders po ON ((po.purchase_order_id = a.purchase_order_id)))
     LEFT JOIN app.customers cust ON ((cust.customer_id = po.customer_id)));


--
-- Name: consultants_ui_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.consultants_ui_view AS
 SELECT consultant_id,
    legacy_consultant_id,
    first_name,
    last_name,
    email,
    phone,
    kelly_employee_unique_id,
    kelly_employee_code,
    created_at,
    updated_at,
    kelly_worker_key,
    display_name,
    employment_start_date,
    employment_end_date,
    ((employment_end_date IS NULL) OR (employment_end_date >= CURRENT_DATE)) AS is_active
   FROM app.consultants c;


--
-- Name: payroll_context; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.payroll_context (
    context_id integer DEFAULT 1 NOT NULL,
    selected_import_run_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT payroll_context_singleton CHECK ((context_id = 1))
);


--
-- Name: current_payroll_run_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.current_payroll_run_view AS
 WITH ctx AS (
         SELECT payroll_context.selected_import_run_id
           FROM app.payroll_context
          WHERE (payroll_context.context_id = 1)
        ), fallback AS (
         SELECT payroll_import_runs.import_run_id
           FROM raw.payroll_import_runs
          WHERE (payroll_import_runs.is_active_for_period = true)
          ORDER BY payroll_import_runs.period_end DESC, payroll_import_runs.period_begin DESC, payroll_import_runs.imported_at DESC
         LIMIT 1
        )
 SELECT import_run_id,
    source,
    bucket,
    storage_path,
    file_sha256,
    period_begin,
    period_end,
    imported_at,
    is_active_for_period,
    period_key
   FROM raw.payroll_import_runs r
  WHERE (import_run_id = COALESCE(( SELECT ctx.selected_import_run_id
           FROM ctx), ( SELECT fallback.import_run_id
           FROM fallback)));


--
-- Name: customer_contacts; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.customer_contacts (
    contact_id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    manager_name text NOT NULL,
    email text,
    phone text,
    title text,
    active boolean DEFAULT true NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    contact_type text DEFAULT 'Manager'::text NOT NULL,
    location_id uuid
);


--
-- Name: customer_invoice_rules; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.customer_invoice_rules (
    invoice_rules_id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    location_id uuid,
    ap_contact_id uuid,
    ap_email text,
    ap_phone text,
    remit_to_name text,
    remit_to_address_line_1 text,
    remit_to_address_line_2 text,
    remit_to_city text,
    remit_to_state text,
    remit_to_zip text,
    requires_po_number boolean DEFAULT true NOT NULL,
    notes text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: customer_locations; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.customer_locations (
    location_id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    location_name text NOT NULL,
    tax_id text,
    street_address_line_1 text,
    street_address_line_2 text,
    city text,
    state text,
    zip text,
    note text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: payroll_punches; Type: TABLE; Schema: raw; Owner: -
--

CREATE TABLE raw.payroll_punches (
    payroll_punch_id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_run_id uuid NOT NULL,
    kelly_punch_id text NOT NULL,
    kelly_employee_unique_id text,
    kelly_employee_code text,
    full_name text,
    punch_date date,
    in_dt timestamp without time zone,
    out_dt timestamp without time zone,
    hours numeric(10,2),
    non_ot_hours numeric(10,2),
    ot1_hours numeric(10,2),
    ot2_hours numeric(10,2),
    lunch_minutes numeric(10,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    kelly_worker_key text NOT NULL,
    category text
);


--
-- Name: payroll_unmatched_employees; Type: TABLE; Schema: raw; Owner: -
--

CREATE TABLE raw.payroll_unmatched_employees (
    unmatched_id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_run_id uuid NOT NULL,
    kelly_employee_unique_id text,
    kelly_employee_code text,
    full_name text,
    period_begin date,
    period_end date,
    total_reg_hours numeric(10,2) DEFAULT 0 NOT NULL,
    total_ot_hours numeric(10,2) DEFAULT 0 NOT NULL,
    total_ot2_hours numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    kelly_worker_key text NOT NULL
);


--
-- Name: import_run_summary_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.import_run_summary_view AS
 SELECT import_run_id,
    source,
    period_begin,
    period_end,
    imported_at,
    ( SELECT count(*) AS count
           FROM raw.payroll_punches p
          WHERE (p.import_run_id = r.import_run_id)) AS punches,
    ( SELECT count(*) AS count
           FROM app.time_entries t
          WHERE (t.import_run_id = r.import_run_id)) AS time_entry_rows,
    ( SELECT count(*) AS count
           FROM raw.payroll_unmatched_employees u
          WHERE (u.import_run_id = r.import_run_id)) AS unmatched_workers,
    ( SELECT sum(((t.reg_hours + t.ot_hours) + t.ot2_hours)) AS sum
           FROM app.time_entries t
          WHERE (t.import_run_id = r.import_run_id)) AS total_hours
   FROM raw.payroll_import_runs r;


--
-- Name: invoice_line_types; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.invoice_line_types (
    line_type text NOT NULL,
    label text NOT NULL,
    description text,
    is_hours boolean DEFAULT false NOT NULL,
    is_expense boolean DEFAULT false NOT NULL,
    is_prepay boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: invoice_lines; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.invoice_lines (
    invoice_line_id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    purchase_order_id uuid,
    consultant_id uuid,
    line_description text,
    service_date_begin date,
    service_date_end date,
    reg_hours numeric(12,2) DEFAULT 0 NOT NULL,
    ot_hours numeric(12,2) DEFAULT 0 NOT NULL,
    ot2_hours numeric(12,2) DEFAULT 0 NOT NULL,
    bill_rate_regular numeric(12,2),
    bill_rate_overtime numeric(12,2),
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    service_date date,
    line_type text,
    service_category text,
    CONSTRAINT chk_invoice_lines_hours_bucket_matches_type CHECK (((line_type IS NULL) OR (line_type = ANY (ARRAY['EXP'::text, 'PP'::text, 'ADJ'::text])) OR ((line_type = 'REG'::text) AND (COALESCE(reg_hours, (0)::numeric) <> (0)::numeric) AND (COALESCE(ot_hours, (0)::numeric) = (0)::numeric) AND (COALESCE(ot2_hours, (0)::numeric) = (0)::numeric)) OR ((line_type = 'OT'::text) AND (COALESCE(ot_hours, (0)::numeric) <> (0)::numeric) AND (COALESCE(reg_hours, (0)::numeric) = (0)::numeric) AND (COALESCE(ot2_hours, (0)::numeric) = (0)::numeric)) OR ((line_type = 'OT2'::text) AND (COALESCE(ot2_hours, (0)::numeric) <> (0)::numeric) AND (COALESCE(reg_hours, (0)::numeric) = (0)::numeric) AND (COALESCE(ot_hours, (0)::numeric) = (0)::numeric)))),
    CONSTRAINT chk_invoice_lines_hours_by_type CHECK ((((line_type = ANY (ARRAY['REG'::text, 'OT'::text, 'OT2'::text])) AND (((
CASE
    WHEN (COALESCE(reg_hours, (0)::numeric) <> (0)::numeric) THEN 1
    ELSE 0
END +
CASE
    WHEN (COALESCE(ot_hours, (0)::numeric) <> (0)::numeric) THEN 1
    ELSE 0
END) +
CASE
    WHEN (COALESCE(ot2_hours, (0)::numeric) <> (0)::numeric) THEN 1
    ELSE 0
END) = 1)) OR ((line_type = ANY (ARRAY['EXP'::text, 'PP'::text, 'ADJ'::text])) AND (COALESCE(reg_hours, (0)::numeric) = (0)::numeric) AND (COALESCE(ot_hours, (0)::numeric) = (0)::numeric) AND (COALESCE(ot2_hours, (0)::numeric) = (0)::numeric)) OR (line_type IS NULL))),
    CONSTRAINT chk_invoice_lines_single_hours_bucket CHECK ((((
CASE
    WHEN (reg_hours <> (0)::numeric) THEN 1
    ELSE 0
END +
CASE
    WHEN (ot_hours <> (0)::numeric) THEN 1
    ELSE 0
END) +
CASE
    WHEN (ot2_hours <> (0)::numeric) THEN 1
    ELSE 0
END) <= 1))
);


--
-- Name: invoice_number_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.invoice_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_preview_po_detail_by_run_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.invoice_preview_po_detail_by_run_view AS
 SELECT b.import_run_id,
    b.purchase_order_id,
    b.purchase_order_number,
    b.project_name,
    b.customer_id,
    b.customer_name,
    b.consultant_id,
    COALESCE(NULLIF(c.display_name, ''::text), concat_ws(' '::text, c.first_name, c.last_name), NULLIF(c.kelly_worker_key, ''::text), NULLIF(c.kelly_employee_code, ''::text), (c.consultant_id)::text) AS consultant_name,
    c.kelly_employee_code,
    c.kelly_worker_key,
    b.service_date,
    b.reg_hours,
    b.ot_hours,
    b.ot2_hours,
    b.bill_rate_regular,
    b.bill_rate_overtime,
    b.reg_amount,
    b.ot_amount,
    b.ot2_amount,
    b.total_amount
   FROM (app.billable_time_by_run_view b
     LEFT JOIN app.consultants c ON ((c.consultant_id = b.consultant_id)));


--
-- Name: invoice_preview_missing_rates_by_run_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.invoice_preview_missing_rates_by_run_view AS
 SELECT import_run_id,
    purchase_order_id,
    purchase_order_number,
    project_name,
    customer_name,
    consultant_id,
    consultant_name,
    service_date,
    reg_hours,
    ot_hours,
    ot2_hours,
    bill_rate_regular,
    bill_rate_overtime,
    total_amount
   FROM app.invoice_preview_po_detail_by_run_view
  WHERE ((((COALESCE(reg_hours, (0)::numeric) + COALESCE(ot_hours, (0)::numeric)) + COALESCE(ot2_hours, (0)::numeric)) > (0)::numeric) AND ((bill_rate_regular IS NULL) OR (bill_rate_regular = (0)::numeric) OR (((COALESCE(ot_hours, (0)::numeric) + COALESCE(ot2_hours, (0)::numeric)) > (0)::numeric) AND (bill_rate_overtime IS NULL))))
  ORDER BY customer_name, project_name, consultant_name, service_date;


--
-- Name: invoice_preview_po_summary_by_run_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.invoice_preview_po_summary_by_run_view AS
 SELECT import_run_id,
    purchase_order_id,
    max(purchase_order_number) AS purchase_order_number,
    max(project_name) AS project_name,
    (min((customer_id)::text))::uuid AS customer_id,
    max(customer_name) AS customer_name,
    sum(COALESCE(reg_hours, (0)::numeric)) AS reg_hours,
    sum(COALESCE(ot_hours, (0)::numeric)) AS ot_hours,
    sum(COALESCE(ot2_hours, (0)::numeric)) AS ot2_hours,
    sum(((COALESCE(reg_hours, (0)::numeric) + COALESCE(ot_hours, (0)::numeric)) + COALESCE(ot2_hours, (0)::numeric))) AS total_hours,
    sum(COALESCE(reg_amount, (0)::numeric)) AS reg_amount,
    sum(COALESCE(ot_amount, (0)::numeric)) AS ot_amount,
    sum(COALESCE(ot2_amount, (0)::numeric)) AS ot2_amount,
    sum(COALESCE(total_amount, (0)::numeric)) AS total_amount,
    count(DISTINCT consultant_id) AS consultant_count,
    count(*) AS line_count
   FROM app.billable_time_by_run_view
  WHERE (purchase_order_id IS NOT NULL)
  GROUP BY import_run_id, purchase_order_id;


--
-- Name: invoices; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.invoices (
    invoice_id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_run_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    period_begin date NOT NULL,
    period_end date NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    invoice_no text,
    invoice_date date,
    due_date date,
    terms text DEFAULT 'net 30'::text,
    purchase_order_id uuid,
    purchase_order_number_snapshot text,
    period_key text
);


--
-- Name: missing_consultants_by_run_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.missing_consultants_by_run_view AS
 WITH punch_rollup AS (
         SELECT p.import_run_id,
            p.kelly_employee_unique_id,
            max(p.kelly_worker_key) AS kelly_worker_key,
            max(p.kelly_employee_code) AS kelly_employee_code,
            max(NULLIF(btrim(p.full_name), ''::text)) AS full_name,
            min(p.punch_date) AS first_service_date,
            max(p.punch_date) AS last_service_date,
            sum(COALESCE(p.non_ot_hours, (0)::numeric)) AS reg_hours,
            sum(COALESCE(p.ot1_hours, (0)::numeric)) AS ot_hours,
            sum(COALESCE(p.ot2_hours, (0)::numeric)) AS ot2_hours,
            sum(((COALESCE(p.non_ot_hours, (0)::numeric) + COALESCE(p.ot1_hours, (0)::numeric)) + COALESCE(p.ot2_hours, (0)::numeric))) AS total_hours
           FROM raw.payroll_punches p
          WHERE (p.kelly_employee_unique_id IS NOT NULL)
          GROUP BY p.import_run_id, p.kelly_employee_unique_id
        )
 SELECT pr.import_run_id,
    pr.kelly_employee_unique_id,
    pr.kelly_worker_key,
    pr.kelly_employee_code,
    pr.full_name,
    pr.first_service_date,
    pr.last_service_date,
    pr.reg_hours,
    pr.ot_hours,
    pr.ot2_hours,
    pr.total_hours
   FROM (punch_rollup pr
     LEFT JOIN app.consultants c ON ((c.kelly_employee_unique_id = pr.kelly_employee_unique_id)))
  WHERE (c.consultant_id IS NULL);


--
-- Name: payroll_import_runs_ui_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.payroll_import_runs_ui_view AS
 SELECT import_run_id,
    source,
    period_begin,
    period_end,
    imported_at,
    bucket,
    storage_path,
    file_sha256,
    is_active_for_period,
    period_key,
    concat(COALESCE(to_char((period_begin)::timestamp with time zone, 'YYYY-MM-DD'::text), 'Unknown'::text), ' → ', COALESCE(to_char((period_end)::timestamp with time zone, 'YYYY-MM-DD'::text), 'Unknown'::text), ' • Imported ', to_char(imported_at, 'YYYY-MM-DD HH24:MI'::text),
        CASE
            WHEN is_active_for_period THEN ' (ACTIVE)'::text
            ELSE ''::text
        END) AS run_label
   FROM raw.payroll_import_runs r
  WHERE (source = 'kelly'::text);


--
-- Name: payroll_import_runs_recent_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.payroll_import_runs_recent_view AS
 SELECT import_run_id,
    source,
    period_begin,
    period_end,
    imported_at,
    bucket,
    storage_path,
    file_sha256,
    is_active_for_period,
    run_label
   FROM app.payroll_import_runs_ui_view
  WHERE (period_begin >= ((date_trunc('month'::text, now()) - '6 mons'::interval))::date)
  ORDER BY imported_at DESC;


--
-- Name: pto_time_by_run_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.pto_time_by_run_view AS
 SELECT import_run_id,
    service_date,
    consultant_id,
    kelly_worker_key,
    pto_hours
   FROM app.time_entries
  WHERE (pto_hours <> (0)::numeric);


--
-- Name: purchase_order_documents; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.purchase_order_documents (
    document_id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_order_id uuid NOT NULL,
    bucket text DEFAULT 'po-documents'::text NOT NULL,
    storage_path text NOT NULL,
    filename text,
    mime_type text,
    file_size_bytes bigint,
    doc_type text DEFAULT 'PO'::text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    note text,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    uploaded_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: purchase_order_spend_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.purchase_order_spend_view AS
 SELECT po.purchase_order_id,
    po.customer_id,
    po.purchase_order_number,
    po.project_name,
    po.amount AS po_cap_amount,
    po.is_stub,
    COALESCE(sum(il.amount), (0)::numeric) AS invoiced_amount,
        CASE
            WHEN (po.amount IS NULL) THEN NULL::numeric
            ELSE (po.amount - COALESCE(sum(il.amount), (0)::numeric))
        END AS remaining_amount
   FROM (app.purchase_orders po
     LEFT JOIN app.invoice_lines il ON ((il.purchase_order_id = po.purchase_order_id)))
  GROUP BY po.purchase_order_id, po.customer_id, po.purchase_order_number, po.project_name, po.amount, po.is_stub;


--
-- Name: purchase_orders_active_consultants_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.purchase_orders_active_consultants_view AS
 SELECT po.purchase_order_id,
    po.purchase_order_number,
    po.project_name,
    po.customer_id,
    cust.name AS customer_name,
    a.consultant_id,
    COALESCE(NULLIF(con.display_name, ''::text), concat_ws(' '::text, con.first_name, con.last_name), NULLIF(con.kelly_worker_key, ''::text), NULLIF(con.kelly_employee_code, ''::text), (con.consultant_id)::text) AS consultant_name,
    a.assignment_start_date,
    a.assignment_end_date,
    a.bill_rate_regular,
    a.bill_rate_overtime
   FROM (((app.purchase_orders po
     JOIN app.customers cust ON ((cust.customer_id = po.customer_id)))
     JOIN app.consultant_po_assignments a ON ((a.purchase_order_id = po.purchase_order_id)))
     JOIN app.consultants con ON ((con.consultant_id = a.consultant_id)))
  WHERE ((a.assignment_start_date <= CURRENT_DATE) AND ((a.assignment_end_date IS NULL) OR (a.assignment_end_date >= CURRENT_DATE)));


--
-- Name: staff_roles; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.staff_roles (
    role_code text NOT NULL,
    role_name text NOT NULL,
    role_rank integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_user_customer_access; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.staff_user_customer_access (
    access_id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_user_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_users; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.staff_users (
    staff_user_id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    display_name text,
    role_code text DEFAULT 'STANDARD'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auth_user_id uuid
);


--
-- Name: staff_users_settings_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.staff_users_settings_view AS
 SELECT u.staff_user_id,
    u.email,
    u.display_name,
    u.role_code,
    r.role_name,
    r.role_rank,
    u.is_active
   FROM (app.staff_users u
     JOIN app.staff_roles r ON ((r.role_code = u.role_code)))
  WHERE (u.is_active = true);


--
-- Name: time_entries_missing_assignment_active_run_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.time_entries_missing_assignment_active_run_view AS
 SELECT te.time_entry_id,
    te.import_run_id,
    te.consultant_id,
    te.kelly_employee_unique_id,
    te.service_date,
    te.reg_hours,
    te.ot_hours,
    te.ot2_hours,
    te.source,
    te.created_at,
    te.kelly_employee_code,
    te.kelly_worker_key
   FROM ((app.time_entries te
     JOIN raw.payroll_import_runs r ON (((r.import_run_id = te.import_run_id) AND (r.is_active_for_period = true))))
     LEFT JOIN app.consultant_po_assignments a ON (((a.consultant_id = te.consultant_id) AND (te.service_date >= a.assignment_start_date) AND ((a.assignment_end_date IS NULL) OR (te.service_date <= a.assignment_end_date)))))
  WHERE (a.assignment_id IS NULL);


--
-- Name: unassigned_time_entries_active_detail_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.unassigned_time_entries_active_detail_view AS
 SELECT te.import_run_id,
    te.service_date,
    te.consultant_id,
    c.display_name AS consultant_name,
    te.kelly_worker_key,
    te.reg_hours,
    te.ot_hours,
    te.ot2_hours,
    ((te.reg_hours + te.ot_hours) + te.ot2_hours) AS total_hours
   FROM (((app.time_entries te
     JOIN raw.payroll_import_runs r ON (((r.import_run_id = te.import_run_id) AND (r.is_active_for_period = true))))
     LEFT JOIN app.consultants c ON ((c.consultant_id = te.consultant_id)))
     LEFT JOIN app.consultant_po_assignments a ON (((a.consultant_id = te.consultant_id) AND (te.service_date >= a.assignment_start_date) AND ((a.assignment_end_date IS NULL) OR (te.service_date <= a.assignment_end_date)))))
  WHERE ((te.consultant_id IS NOT NULL) AND (a.assignment_id IS NULL))
  ORDER BY c.display_name, te.kelly_worker_key, te.service_date;


--
-- Name: unassigned_time_entries_active_ui_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.unassigned_time_entries_active_ui_view AS
 SELECT te.import_run_id,
    te.consultant_id,
    c.display_name AS consultant_name,
    te.kelly_worker_key,
    min(te.service_date) AS first_uncovered_date,
    max(te.service_date) AS last_uncovered_date,
    sum(((te.reg_hours + te.ot_hours) + te.ot2_hours)) AS uncovered_hours
   FROM (((app.time_entries te
     JOIN raw.payroll_import_runs r ON (((r.import_run_id = te.import_run_id) AND (r.is_active_for_period = true))))
     LEFT JOIN app.consultants c ON ((c.consultant_id = te.consultant_id)))
     LEFT JOIN app.consultant_po_assignments a ON (((a.consultant_id = te.consultant_id) AND (te.service_date >= a.assignment_start_date) AND ((a.assignment_end_date IS NULL) OR (te.service_date <= a.assignment_end_date)))))
  WHERE ((te.consultant_id IS NOT NULL) AND (a.assignment_id IS NULL))
  GROUP BY te.import_run_id, te.consultant_id, c.display_name, te.kelly_worker_key
  ORDER BY (sum(((te.reg_hours + te.ot_hours) + te.ot2_hours))) DESC;


--
-- Name: unassigned_time_entries_by_run_detail_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.unassigned_time_entries_by_run_detail_view AS
 SELECT te.import_run_id,
    te.service_date,
    te.consultant_id,
    c.display_name AS consultant_name,
    te.kelly_worker_key,
    te.reg_hours,
    te.ot_hours,
    te.ot2_hours,
    ((te.reg_hours + te.ot_hours) + te.ot2_hours) AS total_hours
   FROM ((app.time_entries te
     LEFT JOIN app.consultants c ON ((c.consultant_id = te.consultant_id)))
     LEFT JOIN app.consultant_po_assignments a ON (((a.consultant_id = te.consultant_id) AND (te.service_date >= a.assignment_start_date) AND ((a.assignment_end_date IS NULL) OR (te.service_date <= a.assignment_end_date)))))
  WHERE ((te.consultant_id IS NOT NULL) AND (a.assignment_id IS NULL))
  ORDER BY c.display_name, te.kelly_worker_key, te.service_date;


--
-- Name: unassigned_time_entries_by_run_ui_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.unassigned_time_entries_by_run_ui_view AS
 SELECT te.import_run_id,
    te.consultant_id,
    c.display_name AS consultant_name,
    te.kelly_worker_key,
    min(te.service_date) AS first_uncovered_date,
    max(te.service_date) AS last_uncovered_date,
    sum(((te.reg_hours + te.ot_hours) + te.ot2_hours)) AS uncovered_hours
   FROM ((app.time_entries te
     LEFT JOIN app.consultants c ON ((c.consultant_id = te.consultant_id)))
     LEFT JOIN app.consultant_po_assignments a ON (((a.consultant_id = te.consultant_id) AND (te.service_date >= a.assignment_start_date) AND ((a.assignment_end_date IS NULL) OR (te.service_date <= a.assignment_end_date)))))
  WHERE ((te.consultant_id IS NOT NULL) AND (a.assignment_id IS NULL))
  GROUP BY te.import_run_id, te.consultant_id, c.display_name, te.kelly_worker_key
  ORDER BY (sum(((te.reg_hours + te.ot_hours) + te.ot2_hours))) DESC;


--
-- Name: unmapped_workers_ui_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.unmapped_workers_ui_view AS
 SELECT te.import_run_id,
    te.kelly_worker_key,
    te.kelly_employee_code,
    min(te.service_date) AS first_service_date,
    max(te.service_date) AS last_service_date,
    sum(te.reg_hours) AS reg_hours,
    sum(te.ot_hours) AS ot_hours,
    sum(te.ot2_hours) AS ot2_hours,
    sum(((te.reg_hours + te.ot_hours) + te.ot2_hours)) AS total_hours
   FROM (app.time_entries te
     JOIN raw.payroll_import_runs r ON (((r.import_run_id = te.import_run_id) AND (r.is_active_for_period = true))))
  WHERE (te.consultant_id IS NULL)
  GROUP BY te.import_run_id, te.kelly_worker_key, te.kelly_employee_code
  ORDER BY (sum(((te.reg_hours + te.ot_hours) + te.ot2_hours))) DESC;


--
-- Name: unmatched_kelly_workers_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.unmatched_kelly_workers_view AS
 SELECT import_run_id,
    kelly_worker_key,
    kelly_employee_code,
    kelly_employee_unique_id,
    full_name,
    period_begin,
    period_end,
    total_reg_hours,
    total_ot_hours,
    total_ot2_hours,
    ((total_reg_hours + total_ot_hours) + total_ot2_hours) AS total_hours
   FROM raw.payroll_unmatched_employees u;


--
-- Name: unmatched_workers_active_run_view; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.unmatched_workers_active_run_view AS
 SELECT u.import_run_id,
    u.kelly_worker_key,
    u.kelly_employee_code,
    u.kelly_employee_unique_id,
    u.full_name,
    u.period_begin,
    u.period_end,
    u.total_reg_hours,
    u.total_ot_hours,
    u.total_ot2_hours,
    ((u.total_reg_hours + u.total_ot_hours) + u.total_ot2_hours) AS total_hours
   FROM (raw.payroll_unmatched_employees u
     JOIN raw.payroll_import_runs r ON ((r.import_run_id = u.import_run_id)))
  WHERE (r.is_active_for_period = true);


--
-- Name: consultants_upload_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.consultants_upload_raw (
    name text,
    kelly_unique_id text,
    kelly_employee_code text
);


--
-- Name: invoice_summary_import; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.invoice_summary_import (
    purchase_order_number text,
    invoice_no text,
    invoice_date date,
    due_date date,
    amount numeric(12,2),
    terms text,
    customer_id uuid NOT NULL,
    period_begin date NOT NULL,
    period_end date NOT NULL
);


--
-- Name: invoice_summary_import_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.invoice_summary_import_raw (
    purchase_order_number text,
    invoice_no text,
    invoice_date text,
    due_date text,
    amount text,
    terms text,
    customer_id text,
    period_begin text,
    period_end text
);


--
-- Name: color_palette color_palette_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.color_palette
    ADD CONSTRAINT color_palette_pkey PRIMARY KEY (hex);


--
-- Name: consultant_po_assignments consultant_po_assignments_no_overlap; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.consultant_po_assignments
    ADD CONSTRAINT consultant_po_assignments_no_overlap EXCLUDE USING gist (consultant_id WITH =, purchase_order_id WITH =, active_date_range WITH &&);


--
-- Name: consultant_po_assignments consultant_po_assignments_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.consultant_po_assignments
    ADD CONSTRAINT consultant_po_assignments_pkey PRIMARY KEY (assignment_id);


--
-- Name: consultants consultants_kelly_employee_unique_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.consultants
    ADD CONSTRAINT consultants_kelly_employee_unique_id_key UNIQUE (kelly_employee_unique_id);


--
-- Name: consultants consultants_legacy_consultant_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.consultants
    ADD CONSTRAINT consultants_legacy_consultant_id_key UNIQUE (legacy_consultant_id);


--
-- Name: consultants consultants_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.consultants
    ADD CONSTRAINT consultants_pkey PRIMARY KEY (consultant_id);


--
-- Name: customer_invoice_rules customer_invoice_rules_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customer_invoice_rules
    ADD CONSTRAINT customer_invoice_rules_pkey PRIMARY KEY (invoice_rules_id);


--
-- Name: customer_locations customer_locations_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customer_locations
    ADD CONSTRAINT customer_locations_pkey PRIMARY KEY (location_id);


--
-- Name: customer_contacts customer_managers_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customer_contacts
    ADD CONSTRAINT customer_managers_pkey PRIMARY KEY (contact_id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (customer_id);


--
-- Name: invoice_line_types invoice_line_types_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_line_types
    ADD CONSTRAINT invoice_line_types_pkey PRIMARY KEY (line_type);


--
-- Name: invoice_lines invoice_lines_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_lines
    ADD CONSTRAINT invoice_lines_pkey PRIMARY KEY (invoice_line_id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (invoice_id);


--
-- Name: payroll_context payroll_context_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.payroll_context
    ADD CONSTRAINT payroll_context_pkey PRIMARY KEY (context_id);


--
-- Name: purchase_order_documents purchase_order_documents_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.purchase_order_documents
    ADD CONSTRAINT purchase_order_documents_pkey PRIMARY KEY (document_id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (purchase_order_id);


--
-- Name: staff_roles staff_roles_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.staff_roles
    ADD CONSTRAINT staff_roles_pkey PRIMARY KEY (role_code);


--
-- Name: staff_user_customer_access staff_user_customer_access_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.staff_user_customer_access
    ADD CONSTRAINT staff_user_customer_access_pkey PRIMARY KEY (access_id);


--
-- Name: staff_users staff_users_auth_user_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.staff_users
    ADD CONSTRAINT staff_users_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: staff_users staff_users_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.staff_users
    ADD CONSTRAINT staff_users_pkey PRIMARY KEY (staff_user_id);


--
-- Name: time_entries time_entries_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (time_entry_id);


--
-- Name: consultants uq_consultants_kelly_code; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.consultants
    ADD CONSTRAINT uq_consultants_kelly_code UNIQUE (kelly_employee_code);


--
-- Name: payroll_import_runs payroll_import_runs_pkey; Type: CONSTRAINT; Schema: raw; Owner: -
--

ALTER TABLE ONLY raw.payroll_import_runs
    ADD CONSTRAINT payroll_import_runs_pkey PRIMARY KEY (import_run_id);


--
-- Name: payroll_punches payroll_punches_pkey; Type: CONSTRAINT; Schema: raw; Owner: -
--

ALTER TABLE ONLY raw.payroll_punches
    ADD CONSTRAINT payroll_punches_pkey PRIMARY KEY (payroll_punch_id);


--
-- Name: payroll_unmatched_employees payroll_unmatched_employees_pkey; Type: CONSTRAINT; Schema: raw; Owner: -
--

ALTER TABLE ONLY raw.payroll_unmatched_employees
    ADD CONSTRAINT payroll_unmatched_employees_pkey PRIMARY KEY (unmatched_id);


--
-- Name: payroll_import_runs uq_payroll_import_runs_sha; Type: CONSTRAINT; Schema: raw; Owner: -
--

ALTER TABLE ONLY raw.payroll_import_runs
    ADD CONSTRAINT uq_payroll_import_runs_sha UNIQUE (source, file_sha256);


--
-- Name: payroll_punches uq_payroll_punches_run_kelly_id; Type: CONSTRAINT; Schema: raw; Owner: -
--

ALTER TABLE ONLY raw.payroll_punches
    ADD CONSTRAINT uq_payroll_punches_run_kelly_id UNIQUE (import_run_id, kelly_punch_id);


--
-- Name: payroll_unmatched_employees uq_unmatched; Type: CONSTRAINT; Schema: raw; Owner: -
--

ALTER TABLE ONLY raw.payroll_unmatched_employees
    ADD CONSTRAINT uq_unmatched UNIQUE (import_run_id, kelly_worker_key);


--
-- Name: ix_assignments_consultant; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_assignments_consultant ON app.consultant_po_assignments USING btree (consultant_id);


--
-- Name: ix_assignments_dates; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_assignments_dates ON app.consultant_po_assignments USING btree (assignment_start_date, assignment_end_date);


--
-- Name: ix_assignments_po; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_assignments_po ON app.consultant_po_assignments USING btree (purchase_order_id);


--
-- Name: ix_consultants_employment_end_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_consultants_employment_end_date ON app.consultants USING btree (employment_end_date);


--
-- Name: ix_consultants_employment_start_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_consultants_employment_start_date ON app.consultants USING btree (employment_start_date);


--
-- Name: ix_consultants_is_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_consultants_is_active ON app.consultants USING btree (is_active);


--
-- Name: ix_consultants_kelly_uid; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_consultants_kelly_uid ON app.consultants USING btree (kelly_employee_unique_id);


--
-- Name: ix_customer_contacts_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_customer_contacts_active ON app.customer_contacts USING btree (active);


--
-- Name: ix_customer_contacts_customer_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_customer_contacts_customer_id ON app.customer_contacts USING btree (customer_id);


--
-- Name: ix_customer_contacts_type; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_customer_contacts_type ON app.customer_contacts USING btree (contact_type);


--
-- Name: ix_customer_invoice_rules_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_customer_invoice_rules_active ON app.customer_invoice_rules USING btree (active);


--
-- Name: ix_customer_invoice_rules_customer_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_customer_invoice_rules_customer_id ON app.customer_invoice_rules USING btree (customer_id);


--
-- Name: ix_customer_invoice_rules_location_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_customer_invoice_rules_location_id ON app.customer_invoice_rules USING btree (location_id);


--
-- Name: ix_customer_locations_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_customer_locations_active ON app.customer_locations USING btree (active);


--
-- Name: ix_customer_locations_customer_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_customer_locations_customer_id ON app.customer_locations USING btree (customer_id);


--
-- Name: ix_customers_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_customers_active ON app.customers USING btree (active);


--
-- Name: ix_customers_name; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_customers_name ON app.customers USING btree (name);


--
-- Name: ix_invoice_lines_consultant; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_invoice_lines_consultant ON app.invoice_lines USING btree (consultant_id);


--
-- Name: ix_invoice_lines_invoice; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_invoice_lines_invoice ON app.invoice_lines USING btree (invoice_id);


--
-- Name: ix_invoice_lines_po; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_invoice_lines_po ON app.invoice_lines USING btree (purchase_order_id);


--
-- Name: ix_invoices_customer_period; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_invoices_customer_period ON app.invoices USING btree (customer_id, period_begin, period_end);


--
-- Name: ix_invoices_period_key; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_invoices_period_key ON app.invoices USING btree (period_key);


--
-- Name: ix_invoices_purchase_order_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_invoices_purchase_order_id ON app.invoices USING btree (purchase_order_id);


--
-- Name: ix_po_docs_po_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_po_docs_po_id ON app.purchase_order_documents USING btree (purchase_order_id);


--
-- Name: ix_po_docs_primary; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_po_docs_primary ON app.purchase_order_documents USING btree (purchase_order_id, is_primary);


--
-- Name: ix_purchase_orders_customer_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_purchase_orders_customer_id ON app.purchase_orders USING btree (customer_id);


--
-- Name: ix_purchase_orders_dates; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_purchase_orders_dates ON app.purchase_orders USING btree (start_date, end_date);


--
-- Name: ix_purchase_orders_location_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_purchase_orders_location_id ON app.purchase_orders USING btree (location_id);


--
-- Name: ix_purchase_orders_po_number; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_purchase_orders_po_number ON app.purchase_orders USING btree (purchase_order_number);


--
-- Name: ix_purchase_orders_tracking_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_purchase_orders_tracking_active ON app.purchase_orders USING btree (tracking_active);


--
-- Name: ix_staff_user_customer_access_customer; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_staff_user_customer_access_customer ON app.staff_user_customer_access USING btree (customer_id);


--
-- Name: ix_staff_users_role_code; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_staff_users_role_code ON app.staff_users USING btree (role_code);


--
-- Name: ix_time_entries_consultant_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_time_entries_consultant_date ON app.time_entries USING btree (consultant_id, service_date);


--
-- Name: ix_time_entries_run; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_time_entries_run ON app.time_entries USING btree (import_run_id);


--
-- Name: ix_time_entries_run_consultant; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_time_entries_run_consultant ON app.time_entries USING btree (import_run_id, consultant_id);


--
-- Name: ix_time_entries_run_workerkey; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_time_entries_run_workerkey ON app.time_entries USING btree (import_run_id, kelly_worker_key);


--
-- Name: uq_assignments_consultant_po_start_active; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX uq_assignments_consultant_po_start_active ON app.consultant_po_assignments USING btree (consultant_id, purchase_order_id, assignment_start_date) WHERE (deleted_at IS NULL);


--
-- Name: uq_consultants_kelly_worker_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX uq_consultants_kelly_worker_key ON app.consultants USING btree (kelly_worker_key) WHERE (kelly_worker_key IS NOT NULL);


--
-- Name: uq_customer_contacts_customer_email; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX uq_customer_contacts_customer_email ON app.customer_contacts USING btree (customer_id, email) WHERE ((email IS NOT NULL) AND (btrim(email) <> ''::text));


--
-- Name: uq_customer_invoice_rules_default_per_customer; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX uq_customer_invoice_rules_default_per_customer ON app.customer_invoice_rules USING btree (customer_id) WHERE ((location_id IS NULL) AND (active = true));


--
-- Name: uq_customer_locations_customer_name; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX uq_customer_locations_customer_name ON app.customer_locations USING btree (customer_id, location_name) WHERE (btrim(location_name) <> ''::text);


--
-- Name: uq_invoices_invoice_no; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX uq_invoices_invoice_no ON app.invoices USING btree (invoice_no) WHERE ((invoice_no IS NOT NULL) AND (invoice_no <> ''::text));


--
-- Name: uq_po_docs_one_primary_per_po; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX uq_po_docs_one_primary_per_po ON app.purchase_order_documents USING btree (purchase_order_id) WHERE (is_primary = true);


--
-- Name: uq_po_docs_unique_path; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX uq_po_docs_unique_path ON app.purchase_order_documents USING btree (bucket, storage_path);


--
-- Name: uq_purchase_orders_customer_po_number; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX uq_purchase_orders_customer_po_number ON app.purchase_orders USING btree (customer_id, purchase_order_number) WHERE ((purchase_order_number IS NOT NULL) AND (purchase_order_number <> ''::text));


--
-- Name: uq_staff_user_customer_access; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX uq_staff_user_customer_access ON app.staff_user_customer_access USING btree (staff_user_id, customer_id);


--
-- Name: uq_staff_users_email_ci; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX uq_staff_users_email_ci ON app.staff_users USING btree (lower(email));


--
-- Name: uq_time_entries_run_worker_date; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX uq_time_entries_run_worker_date ON app.time_entries USING btree (import_run_id, kelly_worker_key, service_date);


--
-- Name: ix_payroll_import_runs_path; Type: INDEX; Schema: raw; Owner: -
--

CREATE INDEX ix_payroll_import_runs_path ON raw.payroll_import_runs USING btree (bucket, storage_path);


--
-- Name: ix_payroll_import_runs_period_key; Type: INDEX; Schema: raw; Owner: -
--

CREATE INDEX ix_payroll_import_runs_period_key ON raw.payroll_import_runs USING btree (period_key);


--
-- Name: ix_payroll_punches_empdate; Type: INDEX; Schema: raw; Owner: -
--

CREATE INDEX ix_payroll_punches_empdate ON raw.payroll_punches USING btree (kelly_employee_unique_id, punch_date);


--
-- Name: ix_payroll_punches_import; Type: INDEX; Schema: raw; Owner: -
--

CREATE INDEX ix_payroll_punches_import ON raw.payroll_punches USING btree (import_run_id);


--
-- Name: ix_payroll_punches_worker_key; Type: INDEX; Schema: raw; Owner: -
--

CREATE INDEX ix_payroll_punches_worker_key ON raw.payroll_punches USING btree (kelly_worker_key);


--
-- Name: ix_unmatched_run; Type: INDEX; Schema: raw; Owner: -
--

CREATE INDEX ix_unmatched_run ON raw.payroll_unmatched_employees USING btree (import_run_id);


--
-- Name: uq_active_run_per_period; Type: INDEX; Schema: raw; Owner: -
--

CREATE UNIQUE INDEX uq_active_run_per_period ON raw.payroll_import_runs USING btree (period_begin, period_end) WHERE (is_active_for_period = true);


--
-- Name: uq_payroll_import_runs_legacy_period; Type: INDEX; Schema: raw; Owner: -
--

CREATE UNIQUE INDEX uq_payroll_import_runs_legacy_period ON raw.payroll_import_runs USING btree (period_begin, period_end) WHERE (source = 'legacy'::text);


--
-- Name: consultant_po_assignments trg_assignments_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_assignments_updated_at BEFORE UPDATE ON app.consultant_po_assignments FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: customer_contacts trg_customer_contacts_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_customer_contacts_updated_at BEFORE UPDATE ON app.customer_contacts FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: customer_invoice_rules trg_customer_invoice_rules_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_customer_invoice_rules_updated_at BEFORE UPDATE ON app.customer_invoice_rules FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: customer_locations trg_customer_locations_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_customer_locations_updated_at BEFORE UPDATE ON app.customer_locations FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: customers trg_customers_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON app.customers FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: invoices trg_invoices_period_key; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_invoices_period_key BEFORE INSERT OR UPDATE OF period_begin ON app.invoices FOR EACH ROW EXECUTE FUNCTION app.set_invoice_period_key();


--
-- Name: payroll_context trg_payroll_context_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_payroll_context_updated_at BEFORE UPDATE ON app.payroll_context FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: purchase_order_documents trg_po_docs_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_po_docs_updated_at BEFORE UPDATE ON app.purchase_order_documents FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: purchase_orders trg_purchase_orders_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_purchase_orders_updated_at BEFORE UPDATE ON app.purchase_orders FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: consultants trg_set_consultant_display_name_default; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_set_consultant_display_name_default BEFORE INSERT OR UPDATE ON app.consultants FOR EACH ROW EXECUTE FUNCTION app.set_consultant_display_name_default();


--
-- Name: staff_roles trg_staff_roles_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_staff_roles_updated_at BEFORE UPDATE ON app.staff_roles FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: staff_user_customer_access trg_staff_user_customer_access_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_staff_user_customer_access_updated_at BEFORE UPDATE ON app.staff_user_customer_access FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: staff_users trg_staff_users_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_staff_users_updated_at BEFORE UPDATE ON app.staff_users FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: payroll_import_runs trg_payroll_import_runs_period_key; Type: TRIGGER; Schema: raw; Owner: -
--

CREATE TRIGGER trg_payroll_import_runs_period_key BEFORE INSERT OR UPDATE OF period_begin ON raw.payroll_import_runs FOR EACH ROW EXECUTE FUNCTION raw.set_payroll_import_run_period_key();


--
-- Name: consultant_po_assignments consultant_po_assignments_consultant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.consultant_po_assignments
    ADD CONSTRAINT consultant_po_assignments_consultant_id_fkey FOREIGN KEY (consultant_id) REFERENCES app.consultants(consultant_id) ON DELETE CASCADE;


--
-- Name: consultant_po_assignments consultant_po_assignments_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.consultant_po_assignments
    ADD CONSTRAINT consultant_po_assignments_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES app.purchase_orders(purchase_order_id) ON DELETE RESTRICT;


--
-- Name: customer_invoice_rules customer_invoice_rules_ap_contact_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customer_invoice_rules
    ADD CONSTRAINT customer_invoice_rules_ap_contact_id_fkey FOREIGN KEY (ap_contact_id) REFERENCES app.customer_contacts(contact_id) ON DELETE SET NULL;


--
-- Name: customer_invoice_rules customer_invoice_rules_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customer_invoice_rules
    ADD CONSTRAINT customer_invoice_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.staff_users(staff_user_id);


--
-- Name: customer_invoice_rules customer_invoice_rules_customer_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customer_invoice_rules
    ADD CONSTRAINT customer_invoice_rules_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES app.customers(customer_id) ON DELETE RESTRICT;


--
-- Name: customer_invoice_rules customer_invoice_rules_location_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customer_invoice_rules
    ADD CONSTRAINT customer_invoice_rules_location_id_fkey FOREIGN KEY (location_id) REFERENCES app.customer_locations(location_id) ON DELETE RESTRICT;


--
-- Name: customer_invoice_rules customer_invoice_rules_updated_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customer_invoice_rules
    ADD CONSTRAINT customer_invoice_rules_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app.staff_users(staff_user_id);


--
-- Name: customer_locations customer_locations_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customer_locations
    ADD CONSTRAINT customer_locations_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.staff_users(staff_user_id);


--
-- Name: customer_locations customer_locations_customer_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customer_locations
    ADD CONSTRAINT customer_locations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES app.customers(customer_id) ON DELETE RESTRICT;


--
-- Name: customer_locations customer_locations_updated_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customer_locations
    ADD CONSTRAINT customer_locations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app.staff_users(staff_user_id);


--
-- Name: customer_contacts customer_managers_customer_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customer_contacts
    ADD CONSTRAINT customer_managers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES app.customers(customer_id) ON DELETE RESTRICT;


--
-- Name: customer_contacts fk_customer_contacts_location; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customer_contacts
    ADD CONSTRAINT fk_customer_contacts_location FOREIGN KEY (location_id) REFERENCES app.customer_locations(location_id) ON DELETE SET NULL;


--
-- Name: customer_contacts fk_customer_managers_created_by_staff_user; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customer_contacts
    ADD CONSTRAINT fk_customer_managers_created_by_staff_user FOREIGN KEY (created_by) REFERENCES app.staff_users(staff_user_id);


--
-- Name: customer_contacts fk_customer_managers_updated_by_staff_user; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customer_contacts
    ADD CONSTRAINT fk_customer_managers_updated_by_staff_user FOREIGN KEY (updated_by) REFERENCES app.staff_users(staff_user_id);


--
-- Name: customers fk_customers_created_by_staff_user; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customers
    ADD CONSTRAINT fk_customers_created_by_staff_user FOREIGN KEY (created_by) REFERENCES app.staff_users(staff_user_id);


--
-- Name: customers fk_customers_updated_by_staff_user; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.customers
    ADD CONSTRAINT fk_customers_updated_by_staff_user FOREIGN KEY (updated_by) REFERENCES app.staff_users(staff_user_id);


--
-- Name: purchase_orders fk_purchase_orders_created_by_staff_user; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.purchase_orders
    ADD CONSTRAINT fk_purchase_orders_created_by_staff_user FOREIGN KEY (created_by) REFERENCES app.staff_users(staff_user_id);


--
-- Name: purchase_orders fk_purchase_orders_location; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.purchase_orders
    ADD CONSTRAINT fk_purchase_orders_location FOREIGN KEY (location_id) REFERENCES app.customer_locations(location_id) ON DELETE SET NULL;


--
-- Name: purchase_orders fk_purchase_orders_updated_by_staff_user; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.purchase_orders
    ADD CONSTRAINT fk_purchase_orders_updated_by_staff_user FOREIGN KEY (updated_by) REFERENCES app.staff_users(staff_user_id);


--
-- Name: invoice_lines invoice_lines_consultant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_lines
    ADD CONSTRAINT invoice_lines_consultant_id_fkey FOREIGN KEY (consultant_id) REFERENCES app.consultants(consultant_id) ON DELETE RESTRICT;


--
-- Name: invoice_lines invoice_lines_invoice_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_lines
    ADD CONSTRAINT invoice_lines_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES app.invoices(invoice_id) ON DELETE CASCADE;


--
-- Name: invoice_lines invoice_lines_line_type_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_lines
    ADD CONSTRAINT invoice_lines_line_type_fkey FOREIGN KEY (line_type) REFERENCES app.invoice_line_types(line_type) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: invoice_lines invoice_lines_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_lines
    ADD CONSTRAINT invoice_lines_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES app.purchase_orders(purchase_order_id) ON DELETE RESTRICT;


--
-- Name: invoices invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES app.customers(customer_id) ON DELETE RESTRICT;


--
-- Name: invoices invoices_import_run_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_import_run_id_fkey FOREIGN KEY (import_run_id) REFERENCES raw.payroll_import_runs(import_run_id) ON DELETE RESTRICT;


--
-- Name: invoices invoices_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES app.purchase_orders(purchase_order_id) ON DELETE RESTRICT;


--
-- Name: payroll_context payroll_context_selected_import_run_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.payroll_context
    ADD CONSTRAINT payroll_context_selected_import_run_id_fkey FOREIGN KEY (selected_import_run_id) REFERENCES raw.payroll_import_runs(import_run_id);


--
-- Name: payroll_context payroll_context_updated_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.payroll_context
    ADD CONSTRAINT payroll_context_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app.staff_users(staff_user_id);


--
-- Name: purchase_order_documents purchase_order_documents_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.purchase_order_documents
    ADD CONSTRAINT purchase_order_documents_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES app.purchase_orders(purchase_order_id) ON DELETE CASCADE;


--
-- Name: purchase_order_documents purchase_order_documents_updated_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.purchase_order_documents
    ADD CONSTRAINT purchase_order_documents_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app.staff_users(staff_user_id);


--
-- Name: purchase_order_documents purchase_order_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.purchase_order_documents
    ADD CONSTRAINT purchase_order_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES app.staff_users(staff_user_id);


--
-- Name: purchase_orders purchase_orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.purchase_orders
    ADD CONSTRAINT purchase_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES app.customers(customer_id) ON DELETE RESTRICT;


--
-- Name: purchase_orders purchase_orders_manager_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.purchase_orders
    ADD CONSTRAINT purchase_orders_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES app.customer_contacts(contact_id) ON DELETE SET NULL;


--
-- Name: staff_user_customer_access staff_user_customer_access_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.staff_user_customer_access
    ADD CONSTRAINT staff_user_customer_access_staff_user_id_fkey FOREIGN KEY (staff_user_id) REFERENCES app.staff_users(staff_user_id) ON DELETE CASCADE;


--
-- Name: staff_users staff_users_role_code_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.staff_users
    ADD CONSTRAINT staff_users_role_code_fkey FOREIGN KEY (role_code) REFERENCES app.staff_roles(role_code);


--
-- Name: time_entries time_entries_consultant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.time_entries
    ADD CONSTRAINT time_entries_consultant_id_fkey FOREIGN KEY (consultant_id) REFERENCES app.consultants(consultant_id);


--
-- Name: time_entries time_entries_import_run_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.time_entries
    ADD CONSTRAINT time_entries_import_run_id_fkey FOREIGN KEY (import_run_id) REFERENCES raw.payroll_import_runs(import_run_id) ON DELETE CASCADE;


--
-- Name: payroll_punches payroll_punches_import_run_id_fkey; Type: FK CONSTRAINT; Schema: raw; Owner: -
--

ALTER TABLE ONLY raw.payroll_punches
    ADD CONSTRAINT payroll_punches_import_run_id_fkey FOREIGN KEY (import_run_id) REFERENCES raw.payroll_import_runs(import_run_id) ON DELETE CASCADE;


--
-- Name: payroll_unmatched_employees payroll_unmatched_employees_import_run_id_fkey; Type: FK CONSTRAINT; Schema: raw; Owner: -
--

ALTER TABLE ONLY raw.payroll_unmatched_employees
    ADD CONSTRAINT payroll_unmatched_employees_import_run_id_fkey FOREIGN KEY (import_run_id) REFERENCES raw.payroll_import_runs(import_run_id) ON DELETE CASCADE;


--
-- Name: consultant_po_assignments assignments_admin_insert; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY assignments_admin_insert ON app.consultant_po_assignments FOR INSERT TO authenticated WITH CHECK (app.is_admin());


--
-- Name: consultant_po_assignments assignments_admin_select; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY assignments_admin_select ON app.consultant_po_assignments FOR SELECT TO authenticated USING (app.is_admin());


--
-- Name: consultant_po_assignments assignments_admin_update; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY assignments_admin_update ON app.consultant_po_assignments FOR UPDATE TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());


--
-- Name: color_palette; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.color_palette ENABLE ROW LEVEL SECURITY;

--
-- Name: consultant_po_assignments; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.consultant_po_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: consultants; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.consultants ENABLE ROW LEVEL SECURITY;

--
-- Name: consultants consultants_admin_insert; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY consultants_admin_insert ON app.consultants FOR INSERT TO authenticated WITH CHECK (app.is_admin());


--
-- Name: consultants consultants_admin_select; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY consultants_admin_select ON app.consultants FOR SELECT TO authenticated USING (app.is_admin());


--
-- Name: consultants consultants_admin_update; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY consultants_admin_update ON app.consultants FOR UPDATE TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());


--
-- Name: customer_contacts; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.customer_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_contacts customer_managers_admin_insert; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY customer_managers_admin_insert ON app.customer_contacts FOR INSERT TO authenticated WITH CHECK (app.is_admin());


--
-- Name: customer_contacts customer_managers_admin_select; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY customer_managers_admin_select ON app.customer_contacts FOR SELECT TO authenticated USING (app.is_admin());


--
-- Name: customer_contacts customer_managers_admin_update; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY customer_managers_admin_update ON app.customer_contacts FOR UPDATE TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());


--
-- Name: customers; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: customers customers_admin_insert; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY customers_admin_insert ON app.customers FOR INSERT TO authenticated WITH CHECK (app.is_admin());


--
-- Name: customers customers_admin_update; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY customers_admin_update ON app.customers FOR UPDATE TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());


--
-- Name: customers customers_read_assigned; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY customers_read_assigned ON app.customers FOR SELECT TO authenticated USING ((app.is_admin() OR (EXISTS ( SELECT 1
   FROM app.staff_user_customer_access a
  WHERE ((a.customer_id = customers.customer_id) AND (a.staff_user_id = app.current_staff_user_id()) AND (a.is_active = true))))));


--
-- Name: invoice_lines; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.invoice_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_lines invoice_lines_read_assigned; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY invoice_lines_read_assigned ON app.invoice_lines FOR SELECT TO authenticated USING ((app.is_admin() OR (EXISTS ( SELECT 1
   FROM (app.invoices i
     JOIN app.staff_user_customer_access a ON (((a.customer_id = i.customer_id) AND (a.staff_user_id = app.current_staff_user_id()) AND (a.is_active = true))))
  WHERE (i.invoice_id = invoice_lines.invoice_id)))));


--
-- Name: invoices; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_read_assigned; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY invoices_read_assigned ON app.invoices FOR SELECT TO authenticated USING ((app.is_admin() OR (EXISTS ( SELECT 1
   FROM app.staff_user_customer_access a
  WHERE ((a.customer_id = invoices.customer_id) AND (a.staff_user_id = app.current_staff_user_id()) AND (a.is_active = true))))));


--
-- Name: payroll_context; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.payroll_context ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_context payroll_context read for staff; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "payroll_context read for staff" ON app.payroll_context FOR SELECT TO authenticated USING (((context_id = 1) AND (EXISTS ( SELECT 1
   FROM app.staff_users su
  WHERE ((su.auth_user_id = auth.uid()) AND (su.is_active = true))))));


--
-- Name: payroll_context payroll_context update for staff; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "payroll_context update for staff" ON app.payroll_context FOR UPDATE TO authenticated USING (((context_id = 1) AND (EXISTS ( SELECT 1
   FROM app.staff_users su
  WHERE ((su.auth_user_id = auth.uid()) AND (su.is_active = true)))))) WITH CHECK (((context_id = 1) AND (EXISTS ( SELECT 1
   FROM app.staff_users su
  WHERE ((su.auth_user_id = auth.uid()) AND (su.is_active = true))))));


--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.purchase_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders purchase_orders_admin_insert; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY purchase_orders_admin_insert ON app.purchase_orders FOR INSERT TO authenticated WITH CHECK (app.is_admin());


--
-- Name: purchase_orders purchase_orders_admin_select; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY purchase_orders_admin_select ON app.purchase_orders FOR SELECT TO authenticated USING (app.is_admin());


--
-- Name: purchase_orders purchase_orders_admin_update; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY purchase_orders_admin_update ON app.purchase_orders FOR UPDATE TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());


--
-- Name: staff_user_customer_access staff_access_read_self; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY staff_access_read_self ON app.staff_user_customer_access FOR SELECT TO authenticated USING ((app.is_admin() OR (staff_user_id = app.current_staff_user_id())));


--
-- Name: staff_user_customer_access; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.staff_user_customer_access ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_users; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.staff_users ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_users staff_users_admin_read_all; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY staff_users_admin_read_all ON app.staff_users FOR SELECT TO authenticated USING (app.is_admin());


--
-- Name: staff_users staff_users_read_self; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY staff_users_read_self ON app.staff_users FOR SELECT TO authenticated USING ((auth_user_id = auth.uid()));


--
-- Name: time_entries; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.time_entries ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--
