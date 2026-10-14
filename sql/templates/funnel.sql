-- Funnel: replace PROJECT, APP_ID, the dates and the three step event names.
-- Counts visitors who completed the steps in order: each step is the first occurrence of its event
-- strictly after the previous step. Only persistent visitor ids make sense across days; cookieless ids
-- (d_...) change every day, so for cookieless apps use session_id instead of visitor_id.
WITH ev AS (
  SELECT visitor_id, event_name, timestamp
  FROM `PROJECT.analytics.events`
  WHERE app_id = 'APP_ID'
    AND DATE(timestamp) BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'
    AND visitor_id IS NOT NULL
    AND event_name IN ('STEP_1_EVENT', 'STEP_2_EVENT', 'STEP_3_EVENT')
),
s1 AS (
  SELECT visitor_id, MIN(timestamp) AS t1
  FROM ev
  WHERE event_name = 'STEP_1_EVENT'
  GROUP BY visitor_id
),
s2 AS (
  SELECT s1.visitor_id, MIN(ev.timestamp) AS t2
  FROM s1
  JOIN ev ON ev.visitor_id = s1.visitor_id AND ev.event_name = 'STEP_2_EVENT' AND ev.timestamp > s1.t1
  GROUP BY s1.visitor_id
),
s3 AS (
  SELECT s2.visitor_id, MIN(ev.timestamp) AS t3
  FROM s2
  JOIN ev ON ev.visitor_id = s2.visitor_id AND ev.event_name = 'STEP_3_EVENT' AND ev.timestamp > s2.t2
  GROUP BY s2.visitor_id
)
SELECT
  (SELECT COUNT(*) FROM s1) AS step1,
  (SELECT COUNT(*) FROM s2) AS step2,
  (SELECT COUNT(*) FROM s3) AS step3;
