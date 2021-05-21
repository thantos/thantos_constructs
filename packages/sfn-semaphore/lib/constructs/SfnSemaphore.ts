import { Duration } from "aws-cdk-lib";
import { IFunction } from "aws-cdk-lib/aws-lambda";
import { NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
import { IQueue, Queue } from "aws-cdk-lib/aws-sqs";
import {
  Choice,
  Condition,
  DISCARD,
  Fail,
  IntegrationPattern,
  IStateMachine,
  JsonPath,
  Parallel,
  State,
  StateMachine,
  Succeed,
  TaskInput,
  Wait,
  WaitTime,
} from "aws-cdk-lib/aws-stepfunctions";
import {
  LambdaInvoke,
  SqsSendMessage,
  StepFunctionsStartExecution,
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
import { AwsSDKNodejsFunction, partialChoiceAfterwards } from '@thantos/cdk_extensions';
import * as path from "path";
import { DeploymentSqsMessage, ManageLockQueueRequest } from "../types";

export interface RequestLockAndWaitProps {
  /**
   * Unique ID to obtail the lock for.
   * This task will run when this ID is first in the queue for its group.
   */
  id: string;
  /**
   * A group ID to use. Each group is queued saparatly. // TODO implment this
   */
  groupId: string;
}

export interface SfnSemaphoreProps {
  pollDuration?: Duration;
}

const idPath = JsonPath.stringAt("$.id");
const groupPath = JsonPath.stringAt("$.groupId");

/**
 * Implements a FIFO ordered lock for step functions.
 * All executions within a group will wait until all executions which came before it are complete before starting.
 *
 * TODO support semaphore with N concurrent jobs instead of top 1.
 */
export class SfnSemaphore extends Construct {
  deploymentQueue: IQueue;
  private checkQueueFunction: IFunction;
  private deleteFromSqsDeploymentQueue: IFunction;
  lockMachine: IStateMachine;

  constructor(scope: Construct, id: string, private props?: SfnSemaphoreProps) {
    super(scope, id);

    // Deployment Queue
    /// FIFO SQS Queue which maintains deployments waiting to be processed
    this.deploymentQueue = new Queue(this, "deploymentQueue", {
      fifo: true,
      visibilityTimeout: Duration.seconds(0),
    });

    const manageLockQueueProps: Partial<NodejsFunctionProps> = {
      entry: path.resolve("lib/functions/manageLockQueue/index.ts"),
      environment: {
        DEPLOYMENT_QUEUE_URL: this.deploymentQueue.queueUrl,
      },
    };

    this.checkQueueFunction = new AwsSDKNodejsFunction(
      this,
      "checkQueueFunction",
      manageLockQueueProps
    );

    this.deleteFromSqsDeploymentQueue = new AwsSDKNodejsFunction(
      this,
      "deleteFromSqsDeploymentQueueFunction",
      {
        ...manageLockQueueProps,
        handler: "clearHandler",
      }
    );

    this.deploymentQueue.grantConsumeMessages(this.checkQueueFunction);
    this.deploymentQueue.grantConsumeMessages(
      this.deleteFromSqsDeploymentQueue
    );

    const submitToQueue = new SqsSendMessage(this, "submitToQueue", {
      queue: this.deploymentQueue,
      messageBody: TaskInput.fromObject({
        deploymentId: idPath,
        token: JsonPath.taskToken,
      } as DeploymentSqsMessage),
      messageGroupId: groupPath, // TODO this will be dynamic in the future when we support multiple manifests.
      messageDeduplicationId: idPath,
      resultPath: DISCARD,
      integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
    });

    const checkQueue = new LambdaInvoke(this, "checkQueue", {
      lambdaFunction: this.checkQueueFunction,
      payloadResponseOnly: true,
      payload: TaskInput.fromObject({
        deploymentId: idPath,
      } as ManageLockQueueRequest),
      resultPath: "$.checkQueueResult",
    });

    const poll = checkQueue.next(
      partialChoiceAfterwards(
        new Choice(this, "isCurrent")
          //// Waits if not
          .when(
            //// If this deployment is current, start the job
            Condition.booleanEquals("$.checkQueueResult.current", false),
            new Wait(this, "waitToPoll", {
              time: WaitTime.duration(
                this.props?.pollDuration || Duration.seconds(30)
              ),
            }).next(checkQueue)
          )
      )
    );

    this.lockMachine = new StateMachine(this, "lockMachine", {
      definition: new Parallel(this, "parallel")
        .branch(
          poll.next(new Fail(this, "donePoll", { error: "Succeed" })),
          submitToQueue.next(new Fail(this, "doneWait", { error: "Succeed" }))
        )
        .addCatch(new Succeed(this, "success"), { errors: ["Succeed"] }),
    });

    this.lockMachine.grantTaskResponse(this.deleteFromSqsDeploymentQueue);
  }

  /**
   * TODO: Support triggering on parent completion to reduce wait time.
   * @param props
   */
  requestLockAndWaitTask(props: RequestLockAndWaitProps): State {
    return new StepFunctionsStartExecution(this, "invokeLockFunction", {
      stateMachine: this.lockMachine,
      input: TaskInput.fromObject({
        id: props.id,
        groupId: props.groupId,
      }),
      integrationPattern: IntegrationPattern.RUN_JOB,
      resultPath: DISCARD,
    });
  }

  relinquishLockTask(props: RequestLockAndWaitProps): State {
    return new LambdaInvoke(this, "deleteThisDeploymentFromQueue", {
      lambdaFunction: this.deleteFromSqsDeploymentQueue,
      resultPath: DISCARD,
      payload: TaskInput.fromObject({
        deploymentId: props.id,
      } as ManageLockQueueRequest),
    });
  }
}
