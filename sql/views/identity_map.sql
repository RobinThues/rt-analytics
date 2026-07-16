CREATE OR REPLACE VIEW `{{PROJECT}}.{{DATASET}}.identity_map` AS
SELECT
  visitor_id,
  user_id,
  MIN(timestamp) AS first_linked_at
FROM `{{PROJECT}}.{{DATASET}}.events`
WHERE event_name = '$identify'
  AND visitor_id IS NOT NULL
  AND user_id IS NOT NULL
GROUP BY visitor_id, user_id;
