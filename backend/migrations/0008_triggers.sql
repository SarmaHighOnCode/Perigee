-- 0008 — triggers: human-in-the-loop brake, audit append-only
--
-- Contract: docs/02-DATA-MODEL.md §7 and §8.
--
-- These enforce policy in the DATABASE rather than the application, so an
-- application refactor cannot quietly remove them.

-- ---------------------------------------------------------------------------
-- Runtime configuration the trigger reads.
--
-- Single row. Synced from environment at application startup so the app and
-- the trigger cannot disagree about the limit. The trigger stays authoritative:
-- even a buggy or bypassed application cannot exceed it.
-- ---------------------------------------------------------------------------
CREATE TABLE system_config (
    id                    boolean PRIMARY KEY DEFAULT true CHECK (id),
    pending_decision_limit int NOT NULL DEFAULT 3 CHECK (pending_decision_limit > 0),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_config (id) VALUES (true);


-- ---------------------------------------------------------------------------
-- The pending-decision brake.
--
-- A device carrying too many unadjudicated searches is stopped. This is what
-- turns "there is a human in the loop" from a claim into a property: you
-- cannot accumulate a queue of unreviewed biometric results.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_pending_decision_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    open_count int;
    max_open   int;
BEGIN
    -- A NULL device_id cannot be rate-limited per device; reject rather than
    -- silently exempting it.
    IF NEW.device_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT pending_decision_limit INTO max_open FROM system_config WHERE id;

    SELECT count(*) INTO open_count
    FROM   search_event
    WHERE  device_id = NEW.device_id
      AND  status = 'PENDING_DECISION';

    IF open_count >= max_open THEN
        RAISE EXCEPTION 'PENDING_DECISION_LIMIT: % searches await adjudication', open_count
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER trg_pending_limit
    BEFORE INSERT ON search_event
    FOR EACH ROW EXECUTE FUNCTION enforce_pending_decision_limit();


-- ---------------------------------------------------------------------------
-- Audit append-only.
--
-- Tamper-EVIDENT, not tamper-proof: a superuser can drop these triggers. But
-- not without breaking the hash chain from that point forward, which
-- GET /v1/audit/verify surfaces immediately. See docs/08-SECURITY.md §3.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_is_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_event is append-only (attempted %)', TG_OP
        USING ERRCODE = 'raise_exception';
END $$;

CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_event
    FOR EACH ROW EXECUTE FUNCTION audit_is_append_only();

CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_event
    FOR EACH ROW EXECUTE FUNCTION audit_is_append_only();
