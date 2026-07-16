-- Funnel: replace the three step event names and the app/date filter.
-- Counts visitors who completed each step in order within the window.
WITH per_visitor AS (
  SELECT
    visitor_id,
    MIN(IF(event_name = 'STEP_1_EVENT', timestamp, NULL)) AS t1,
    MIN(IF(event_name = 'STEP_2_EVENT', timestamp, NULL)) AS t2,
    MIN(IF(event_name = 'STEP_3_EVENT', timestamp, NULL)) AS t3
  FROM `PROJECT.analytics.events`
  WHERE app_id = 'APP_ID'
    AND DATE(timestamp) BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'
  GROUP BY visitor_id
)
SELECT
  COUNT(t1) AS step1,
  COUNTIF(t2 > t1) AS step2,
  COUNTIF(t3 > t2 AND t2 > t1) AS step3
FROM per_visitor;
