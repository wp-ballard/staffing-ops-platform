# Architecture Overview

This project is structured as a lightweight internal operations platform built around three main layers:

## 1. Front end
The React application in `app/` provides the operational interface for managing consultants, customers, purchase orders, invoices, import runs, and related workflows.

## 2. Database layer
The curated schema in `supabase/schema/` reflects the application-specific PostgreSQL structure used to support staffing operations workflows, import tracking, relational business entities, and downstream billing support.

## 3. Backend automation
The Edge Functions in `supabase/functions/` handle backend workflow automation. The included payroll XML import example demonstrates how inbound files can be validated, deduplicated, parsed, normalized, matched against business entities, and written into structured operational records.

## Design intent
The overall design goal was to create a more structured operating layer for workflows that are often fragmented across spreadsheets, exports, and manual reconciliation steps.

This repository is presented as a curated portfolio case study, so some naming and structure have been simplified for public sharing.
