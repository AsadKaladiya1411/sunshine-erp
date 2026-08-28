declare const kafkaTopicNameType: unique symbol;
declare const kafkaConsumerGroupIdType: unique symbol;

export type KafkaTopicName = string & {
  readonly [kafkaTopicNameType]: true;
};

export type KafkaConsumerGroupId = string & {
  readonly [kafkaConsumerGroupIdType]: true;
};

const kafkaIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function requireKafkaIdentifier(
  value: string,
  label: string,
  maximumLength: number,
): string {
  if (
    value.length > maximumLength ||
    value === "." ||
    value === ".." ||
    !kafkaIdentifierPattern.test(value)
  ) {
    throw new TypeError(`${label} is invalid.`);
  }

  return value;
}

export function createKafkaTopicName(value: string): KafkaTopicName {
  return requireKafkaIdentifier(
    value,
    "Kafka topic name",
    249,
  ) as KafkaTopicName;
}

export function createKafkaConsumerGroupId(
  value: string,
): KafkaConsumerGroupId {
  return requireKafkaIdentifier(
    value,
    "Kafka consumer group ID",
    255,
  ) as KafkaConsumerGroupId;
}

export function createKafkaMessageKey(value: string): string {
  if (value.trim().length === 0) {
    throw new TypeError("Kafka message key must not be empty.");
  }

  return value;
}
