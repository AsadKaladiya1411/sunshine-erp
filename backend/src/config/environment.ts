function readPort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return 4000;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}

export const environment = Object.freeze({
  port: readPort(process.env.PORT),
  corsOrigin: process.env.CORS_ORIGIN?.trim() || "http://localhost:3000",
});

