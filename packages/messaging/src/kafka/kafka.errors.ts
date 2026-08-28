export type KafkaInfrastructureErrorCode =
  | "KAFKA_DISABLED"
  | "KAFKA_CONNECTION_FAILED"
  | "KAFKA_DISCONNECTION_FAILED"
  | "KAFKA_PUBLICATION_FAILED"
  | "KAFKA_CONSUMER_FAILED"
  | "KAFKA_MESSAGE_INVALID";

export class KafkaInfrastructureError extends Error {
  constructor(
    public readonly code: KafkaInfrastructureErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "KafkaInfrastructureError";
  }
}

export class KafkaDisabledError extends KafkaInfrastructureError {
  constructor() {
    super("KAFKA_DISABLED", "Kafka infrastructure is disabled.");
  }
}

export class KafkaConnectionError extends KafkaInfrastructureError {
  constructor() {
    super("KAFKA_CONNECTION_FAILED", "Kafka connection failed.");
  }
}

export class KafkaDisconnectionError extends KafkaInfrastructureError {
  constructor() {
    super("KAFKA_DISCONNECTION_FAILED", "Kafka disconnection failed.");
  }
}

export class KafkaPublicationError extends KafkaInfrastructureError {
  constructor() {
    super("KAFKA_PUBLICATION_FAILED", "Kafka publication failed.");
  }
}

export class KafkaConsumerError extends KafkaInfrastructureError {
  constructor() {
    super("KAFKA_CONSUMER_FAILED", "Kafka consumer operation failed.");
  }
}

export class KafkaMessageInvalidError extends KafkaInfrastructureError {
  constructor(message = "Kafka message is invalid.") {
    super("KAFKA_MESSAGE_INVALID", message);
  }
}
