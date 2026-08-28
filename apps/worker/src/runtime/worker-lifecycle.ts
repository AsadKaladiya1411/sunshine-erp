export interface WorkerLifecycleComponent {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface WorkerKafkaLifecycle {
  readonly enabled: boolean;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
}

export interface WorkerStartResult {
  readonly kafkaAvailable: boolean;
}
