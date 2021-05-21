import { Handler } from "aws-lambda";
import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { SendTaskSuccessCommand, SFNClient } from "@aws-sdk/client-sfn";
import { CheckQueueResult, DeploymentSqsMessage, DeploymentSqsWrapper, ManageLockQueueRequest } from "../types";

const SQS = new SQSClient({});
const SFN = new SFNClient({});

const DEPLOYMENT_QUEUE_URL = process.env.DEPLOYMENT_QUEUE_URL;

const CONCURRENCY = 1;

/**
 * Retrieve the top messages.
 * @param maintainControl if true, the message will be held by this execution for 10 seconds.
 *                        Only used to ensure we have enough time to delete the message.
 *                        If visibility timeout is 0, the receipt handle will be expired immediately.
 * @param count number of messages to recieve
 * @returns A message or undefined
 */
const getMessages = async (
  maintainControl = false,
  count = 1
): Promise<DeploymentSqsWrapper[]> => {
  return (
    (
      await SQS.send(
        new ReceiveMessageCommand({
          QueueUrl: DEPLOYMENT_QUEUE_URL,
          VisibilityTimeout: maintainControl ? 10 : 0,
          MaxNumberOfMessages: count,
        })
      )
    ).Messages?.filter((x): x is Message & { Body: string } => !!x.Body)?.map(
      (x) => ({
        deploymentMessage: JSON.parse(x.Body) as DeploymentSqsMessage,
        messageId: x.MessageId || "",
        receiptHandle: x.ReceiptHandle,
      })
    ) || []
  );
};

const retry = async <T>(
  func: () => Promise<T>,
  test: (val: T) => boolean,
  attempt: number,
  waitTime: number
): Promise<T> => {
  const val = await func();

  if (test(val) || attempt <= 0) return val;

  await new Promise((resolve) => setTimeout(resolve, waitTime));

  return retry(func, test, attempt - 1, waitTime);
};

/**
 * Retrieve the top message if it is associated with the current execution.
 * @param deploymentId current execution ID which is polling for the "lock"
 * @returns A message or undefined
 */
const getDeploymentMessage = async (
  messages: DeploymentSqsWrapper[],
  deploymentId: string
): Promise<DeploymentSqsWrapper | undefined> => {
  return messages.find(
    (message) => message.deploymentMessage.deploymentId === deploymentId
  );
};

/**
 * Check to see if the current execution is at the top of the deployment queue for the current group.
 */
export const handler: Handler<ManageLockQueueRequest, CheckQueueResult> =
  async (event) => {
    // Try to get messages. If none are found, wait 500ms and try again.
    // This only increases the speed of a message starting on an otherwise empty queue.
    const messages = await retry(
      async () => await getMessages(),
      (messages) => messages.length > 0,
      1,
      500
    );

    const message = await getDeploymentMessage(messages, event.deploymentId);

    console.log(`Found message ${message?.messageId}.`);

    return {
      current: !!message,
      messageId: message?.messageId,
    } as CheckQueueResult;
  };

/**
 * Tries to clear the current execution off of the top of the queue.
 * We assume that this execution is the one with the current "lock" for the group.
 * First we need to retrieve the message again to get a valid receipt.
 * Then we delete using the handle.
 */
export const clearHandler: Handler<ManageLockQueueRequest> = async (event) => {
  const messages = await getMessages(true, CONCURRENCY + 1);
  const message = await getDeploymentMessage(messages, event.deploymentId);

  if (message?.receiptHandle) {
    await SQS.send(
      new DeleteMessageCommand({
        QueueUrl: DEPLOYMENT_QUEUE_URL,
        ReceiptHandle: message.receiptHandle,
      })
    );

    // Try to start the next
    await Promise.all(
      messages
        .filter((x) => x !== message)
        .map(async (x) => {
          try {
            // Should this be a batch of all?
            await SQS.send(
              new ChangeMessageVisibilityCommand({
                QueueUrl: DEPLOYMENT_QUEUE_URL,
                ReceiptHandle: x.receiptHandle,
                VisibilityTimeout: 0,
              })
            );
            return SFN.send(
              new SendTaskSuccessCommand({
                taskToken: x.deploymentMessage.token,
                output: "{}",
              })
            );
          } catch (error) {
            console.log(
              `Could not start: ${x.deploymentMessage.deploymentId}. ${error}`
            );
          }
          return;
        })
    );
  } else {
    // How did we get here?
    throw Error(
      `Tried to clear an execution that no longer exists or isn't at the top of the queue! Found ids ${messages.map(
        (x) => x.deploymentMessage.deploymentId
      )} instead.`
    );
  }
};
