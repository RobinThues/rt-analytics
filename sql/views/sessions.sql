CREATE OR REPLACE VIEW `{{PROJECT}}.{{DATASET}}.sessions` AS
SELECT
  app_id,
  session_id,
  ANY_VALUE(visitor_id) AS visitor_id,
  ANY_VALUE(user_id) AS user_id,
  MIN(timestamp) AS started_at,
  MAX(timestamp) AS ended_at,
  TIMESTAMP_DIFF(MAX(timestamp), MIN(timestamp), SECOND) AS duration_s,
  COUNTIF(event_name = '$pageview') AS pageviews,
  ARRAY_AGG(IF(event_name = '$pageview', page_path, NULL) IGNORE NULLS ORDER BY timestamp ASC LIMIT 1)[SAFE_OFFSET(0)] AS entry_path,
  ARRAY_AGG(IF(event_name = '$pageview', page_path, NULL) IGNORE NULLS ORDER BY timestamp DESC LIMIT 1)[SAFE_OFFSET(0)] AS exit_path,
  ANY_VALUE(referrer) AS referrer,
  ANY_VALUE(country) AS country,
  ANY_VALUE(device_type) AS device_type,
  COUNTIF(event_name = '$pageview') <= 1 AS bounced
FROM `{{PROJECT}}.{{DATASET}}.events`
GROUP BY app_id, session_id;
