export class RedisUnavailableError extends Error {
  constructor(message = "Redis is not connected.") {
    super(message);
    this.name = "RedisUnavailableError";
  }
}
