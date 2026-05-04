-- Notifications inbox: persistent record of low-stock + expiring-batch alerts.
-- The scanner upserts on `dedup_key` so a single underlying issue produces a
-- single notification (and a single email) until it is dismissed.
CREATE TABLE IF NOT EXISTS invex.notifications (
    id           SERIAL      PRIMARY KEY,
    type         VARCHAR(40) NOT NULL
                 CHECK (type IN ('LOW_STOCK', 'OUT_OF_STOCK', 'EXPIRING_BATCH', 'EXPIRED_BATCH')),
    severity     VARCHAR(10) NOT NULL DEFAULT 'warning'
                 CHECK (severity IN ('info', 'warning', 'critical')),
    dedup_key    VARCHAR(120) NOT NULL UNIQUE,
    title        VARCHAR(200) NOT NULL,
    body         TEXT         NOT NULL,
    link         VARCHAR(255),
    is_read      BOOLEAN      NOT NULL DEFAULT FALSE,
    email_sent   BOOLEAN      NOT NULL DEFAULT FALSE,
    email_sent_at TIMESTAMP,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON invex.notifications (is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type
    ON invex.notifications (type);
