import adapter from "../lib/netlify-adapter.cjs";
import legacy from "../lib/destination.cjs";

export default async (request, context) => {
  const event = await adapter.requestToEvent(request, context);
  const result = await legacy.handler(event, context);
  return adapter.legacyToResponse(result);
};
