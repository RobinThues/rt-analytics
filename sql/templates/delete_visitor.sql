-- GDPR helper: delete every event of one visitor id.
DELETE FROM `PROJECT.analytics.events`
WHERE visitor_id = 'VISITOR_ID';
