-- Deletion request for server events: delete every event of one app whose props.subscription is one of the
-- given pseudonyms. Get the ids with `npm run pseudonymize -- --app APP_ID <value>...`.
DELETE FROM `PROJECT.analytics.events`
WHERE app_id = 'APP_ID'
  AND JSON_VALUE(props, '$.subscription') IN UNNEST(['ID_1', 'ID_2']);
