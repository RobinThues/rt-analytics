-- Weekly retention cohorts (persistent visitor ids only, i.e. consented visitors).
WITH firsts AS (
  SELECT visitor_id, DATE_TRUNC(MIN(DATE(timestamp)), WEEK(MONDAY)) AS cohort_week
  FROM `PROJECT.analytics.events`
  WHERE app_id = 'APP_ID' AND visitor_id NOT LIKE 'd_%'
  GROUP BY visitor_id
),
activity AS (
  SELECT DISTINCT visitor_id, DATE_TRUNC(DATE(timestamp), WEEK(MONDAY)) AS active_week
  FROM `PROJECT.analytics.events`
  WHERE app_id = 'APP_ID' AND visitor_id NOT LIKE 'd_%'
)
SELECT
  f.cohort_week,
  DATE_DIFF(a.active_week, f.cohort_week, WEEK) AS week_n,
  COUNT(DISTINCT a.visitor_id) AS visitors
FROM firsts f
JOIN activity a USING (visitor_id)
GROUP BY cohort_week, week_n
ORDER BY cohort_week, week_n;
