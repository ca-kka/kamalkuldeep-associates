import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// OneDrive reverse synchronization.
// Maintenance performs incremental delta sync hourly and automatically performs
// a full reconciliation whenever the last full reconciliation is older than 24h.
// Full reconciliation records last_full_reconcile_at and rebuilds the delta cursor.
// Webhook notifications, subscription renewal, external deletion marking,
// and authenticated staff operations remain enabled.

// NOTE: This source-control marker documents the deployed v2 behavior. The
// production deployment is the authoritative executable source.
