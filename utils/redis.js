import { createClient } from "redis";

let _clientPromise = null;

/** Lazily connects a shared Redis client (REDIS_URL, defaults to localhost). */
function getRedis() {
  if (_clientPromise) return _clientPromise;
  const client = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
    socket: {
      connectTimeout: 5000,
      // Give up instead of retrying forever, so requests fail fast with a
      // 500 rather than hanging when Redis is down or incompatible.
      reconnectStrategy: (retries) =>
        retries >= 3 ? new Error("Redis is unreachable.") : 250,
    },
  });
  client.on("error", (err) => console.error("[redis]", err.message));
  _clientPromise = client
    .connect()
    .then(() => client)
    .catch((err) => {
      _clientPromise = null; // allow the next request to retry a fresh connect
      throw err;
    });
  return _clientPromise;
}

export { getRedis };
