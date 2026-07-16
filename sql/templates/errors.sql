-- Most frequent JS errors in the last 7 days.
SELECT
  app_id,
  JSON_VALUE(props, '$.message') AS message,
  COUNT(*) AS occurrences,
  MAX(timestamp) AS last_seen
FROM `PROJECT.analytics.events`
WHERE event_name = '$error'
  AND DATE(timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY app_id, message
ORDER BY occurrences DESC
LIMIT 50;
