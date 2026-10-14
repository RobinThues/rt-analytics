import { createAnalyticsHandler } from "rt-analytics/next";

export const { GET, POST } = createAnalyticsHandler({ allowedAppIds: ["demo"] });
