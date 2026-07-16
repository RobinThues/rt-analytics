CREATE OR REPLACE VIEW `{{PROJECT}}.{{DATASET}}.daily_stats` AS
SELECT
  app_id,
  DATE(timestamp) AS day,
  COUNTIF(event_name = '$pageview') AS pageviews,
  COUNT(DISTINCT visitor_id) AS unique_visitors,
  COUNT(DISTINCT session_id) AS sessions,
  COUNT(DISTINCT user_id) AS identified_users
FROM `{{PROJECT}}.{{DATASET}}.events`
GROUP BY app_id, day;
