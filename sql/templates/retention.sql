-- Weekly retention cohorts (persistent visitor ids only, i.e. consented visitors).
-- Replace PROJECT, APP_ID and the dates. Cohort = week (Monday) of a visitor's first event in the range;
-- visitors seen before the range count as new. Cookieless ids (d_...) change every day and are excluded.
WITH persistent AS (
  SELECT visitor_id, DATE(timestamp) AS day
  FROM `PROJECT.analytics.events`
  WHERE app_id = 'APP_ID'
    AND DATE(timestamp) BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'
    AND visitor_id IS NOT NULL
    AND NOT STARTS_WITH(visitor_id, 'd_')
),
firsts AS (
  SELECT visitor_id, DATE_TRUNC(MIN(day), WEEK(MONDAY)) AS cohort_week
  FROM persistent
  GROUP BY visitor_id
),
activity AS (
  SELECT DISTINCT visitor_id, DATE_TRUNC(day, WEEK(MONDAY)) AS active_week
  FROM persistent
)
SELECT
  f.cohort_week,
  DATE_DIFF(a.active_week, f.cohort_week, WEEK) AS week_n,
  COUNT(DISTINCT a.visitor_id) AS visitors
FROM firsts f
JOIN activity a USING (visitor_id)
GROUP BY cohort_week, week_n
ORDER BY cohort_week, week_n;
