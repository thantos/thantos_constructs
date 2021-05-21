export interface DeploymentSqsMessage {
  deploymentId: string;
  token: string;
}

export interface DeploymentSqsWrapper {
  messageId: string;
  deploymentMessage: DeploymentSqsMessage;
  receiptHandle?: string;
}

export interface ManageLockQueueRequest {
  deploymentId: string;
}

export interface CheckQueueResult {
  current: boolean;
  messageId?: string;
}
