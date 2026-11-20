// JSON 404 for unknown /api routes (instead of the HTML not-found page).
import { fail } from "@/server/http";

const notFound = () => fail(404, "Unknown API route.");
export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
