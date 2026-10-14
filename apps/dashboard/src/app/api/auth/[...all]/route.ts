import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/auth/auth";

// Built per request so this module never reads the environment at import time.
export const GET = (request: Request) => toNextJsHandler(getAuth()).GET(request);
export const POST = (request: Request) => toNextJsHandler(getAuth()).POST(request);
