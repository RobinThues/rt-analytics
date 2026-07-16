-- p75 Web Vitals per app and metric over the last 28 days.
SELECT
  app_id,
  JSON_VALUE(props, '$.metric') AS metric,
  APPROX_QUANTILES(CAST(JSON_VALUE(props, '$.value') AS FLOAT64), 100)[OFFSET(75)] AS p75
FROM `PROJECT.analytics.events`
WHERE event_name = '$web_vital'
  AND DATE(timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY)
GROUP BY app_id, metric
ORDER BY app_id, metric;
