import {
  Pass,
  JsonPath,
  TaskInput,
  DISCARD,
  Parallel,
  Choice,
  Condition,
  StateMachine,
  IChainable,
  INextable,
  IStateMachine
} from 'aws-cdk-lib/aws-stepfunctions';
import {
  DynamoPutItem,
  DynamoAttributeValue,
  LambdaInvoke,
  DynamoGetItem,
  DynamoUpdateItem
} from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { UpdateStageParameterRequest } from '../functions/updateStageParameter';
import { SfnSemaphore } from '@thantos/sfn-semaphore';
import * as path from 'path';
import { DeployInfra } from './DeployInfra';
import { MDIntegration } from '../types';
import { DEFAULT_GROUP, DeploymentStatus, DYNAMO_CONSTANTS, emptyManifest, FINAL_STAGE } from '../constants';
import { AwsSDKNodejsFunction, UnvalidatedJsonPath } from '@thantos/cdk_extensions';
import { DeployStage } from './DeployStage';

export interface DeployerMachineProps {
  semaphore: SfnSemaphore;
  infra: DeployInfra;
  mergeFunction: MDIntegration;
  validateManifestFunction?: MDIntegration;
  updatedManifestHook?: MDIntegration;
  stages?: DeployStage[];
}

export class DeployerMachine extends Construct {
  machine: IStateMachine;

  constructor(scope: Construct, id: string, props: DeployerMachineProps) {
    super(scope, id);

    // Deployment Machine

    // Put all of the input in a state variable
    const preserveInput = new Pass(this, 'preserveInput', {
      parameters: {
        input: JsonPath.entirePayload
      }
    });

    const submitToDynamo = new DynamoPutItem(this, 'submitToTable', {
      item: {
        [DYNAMO_CONSTANTS.deployment.id]: DynamoAttributeValue.fromString(
          JsonPath.stringAt('$$.Execution.Name')
        ),
        [DYNAMO_CONSTANTS.deployment.input]: DynamoAttributeValue.fromString(
          UnvalidatedJsonPath.stringAt('States.JsonToString($.input)')
        ),
        [DYNAMO_CONSTANTS.deployment.state]: DynamoAttributeValue.fromString(
          DeploymentStatus.WAITING
        ),
        [DYNAMO_CONSTANTS.deployment.created]: DynamoAttributeValue.fromString(
          JsonPath.stringAt('$$.Execution.StartTime')
        ),
        [DYNAMO_CONSTANTS.deployment.updated]: DynamoAttributeValue.fromString(
          JsonPath.stringAt('$$.Execution.StartTime')
        ),
        [DYNAMO_CONSTANTS.deployment.group]: DynamoAttributeValue.fromString(
          DEFAULT_GROUP
        )
      },
      table: props.infra.deploymentTable,
      resultPath: DISCARD
    });

    const getCurrentManifestId = new DynamoGetItem(this, 'getManifestId', {
      key: {
        [DYNAMO_CONSTANTS.stage.stage]: DynamoAttributeValue.fromString(
          FINAL_STAGE
        )
      },
      table: props.infra.stagesTable,
      resultPath: '$.finalStageManifestId',
      consistentRead: true
    });

    const getCurrentManifest = new DynamoGetItem(this, 'getManifest', {
      key: {
        [DYNAMO_CONSTANTS.manifest.id]: DynamoAttributeValue.fromString(
          JsonPath.stringAt('$.finalStageManifestId.Item.manifestId.S')
        )
      },
      table: props.infra.manifestTable,
      resultPath: '$.finalStageManifestResults'
    });

    // TODO: Add option for step function instead of lambda
    const merge =
      props.mergeFunction.type === 'Lambda' &&
      new LambdaInvoke(this, 'merge', {
        lambdaFunction: props.mergeFunction.func,
        payload: TaskInput.fromObject({
          request: JsonPath.stringAt('$.input'), // TODO where is this coming from?
          manifest: JsonPath.stringAt('$.current.manifest')
        }),
        payloadResponseOnly: true,
        resultPath: '$.updated'
      });

    if (!merge) {
      throw Error('Invalid merge integration');
    }

    // TODO: Add option for step function instead of lambda
    const validateManifest =
      props.validateManifestFunction?.type === 'Lambda' &&
      new LambdaInvoke(this, 'validateManifest', {
        lambdaFunction: props.validateManifestFunction.func,
        payload: TaskInput.fromObject({
          current: JsonPath.stringAt('$.current.manifest'),
          updated: JsonPath.stringAt('$.updated.manifest')
        }),
        payloadResponseOnly: true,
        resultPath: '$.validateManifestResults'
      });

    if (props.validateManifestFunction && !validateManifest) {
      throw Error('Invalid validate manifest integration');
    }

    const updatedManifestHook =
      props.updatedManifestHook?.type === 'Lambda' &&
      new LambdaInvoke(this, 'updatedManifestHook', {
        lambdaFunction: props.updatedManifestHook.func,
        payload: TaskInput.fromObject({
          manifestId: JsonPath.stringAt('$$.Execution.Name'),
          manifest: JsonPath.stringAt('$.updated.manifest')
        }),
        resultPath: DISCARD
      });

    if (props.updatedManifestHook && !validateManifest) {
      throw Error('Invalid manifest hook integration');
    }

    const flipStageTable = (stage: string, value: string) =>
      new DynamoPutItem(this, `flipStageTable${stage}`, {
        item: {
          manifestId: DynamoAttributeValue.fromString(value),
          stage: DynamoAttributeValue.fromString(stage)
        },
        table: props.infra.stagesTable,
        resultPath: DISCARD
      });

    const flipStageParameterFunction = new AwsSDKNodejsFunction(
      this,
      'flipStageParamFunction',
      {
        entry: path.resolve(__dirname, '../functions/updateStageParameter/index.js')
      }
    );

    const updateDeploymentState = (
      id: string,
      status: DeploymentStatus,
      previousStatus: DeploymentStatus
    ) =>
      new DynamoUpdateItem(this, id, {
        key: {
          [DYNAMO_CONSTANTS.deployment.id]: DynamoAttributeValue.fromString(
            JsonPath.stringAt('$$.Execution.Name')
          )
        },
        table: props.infra.deploymentTable,
        updateExpression: 'SET #state = :state, #updated = :updated',
        expressionAttributeNames: {
          '#state': DYNAMO_CONSTANTS.deployment.state,
          '#updated': DYNAMO_CONSTANTS.deployment.updated
        },
        expressionAttributeValues: {
          ':state': DynamoAttributeValue.fromString(status),
          ':prevState': DynamoAttributeValue.fromString(previousStatus),
          ':updated': DynamoAttributeValue.fromString(
            JsonPath.stringAt('$$.State.EnteredTime')
          )
        },
        conditionExpression: '#state = :prevState',
        resultPath: DISCARD
      });

    const updateDeploymentParent = new DynamoUpdateItem(
      this,
      'updateDeploymentParent',
      {
        key: {
          [DYNAMO_CONSTANTS.deployment.id]: DynamoAttributeValue.fromString(
            JsonPath.stringAt('$$.Execution.Name')
          )
        },
        table: props.infra.deploymentTable,
        updateExpression: 'SET #parent = :parent',
        expressionAttributeNames: {
          '#parent': DYNAMO_CONSTANTS.deployment.parent
        },
        expressionAttributeValues: {
          ':parent': DynamoAttributeValue.fromString(
            JsonPath.stringAt(
              `$.finalStageManifestId.Item.${DYNAMO_CONSTANTS.stage.manifestId}.S`
            )
          )
        },
        resultPath: DISCARD
      }
    );

    const flipStageParameter = (stage: string, value: string) => {
      const param = props.infra.parameters[stage];
      param.grantWrite(flipStageParameterFunction);
      return new LambdaInvoke(this, `flipStageParam${stage}`, {
        lambdaFunction: flipStageParameterFunction,
        payload: TaskInput.fromObject({
          parameterName: param.parameterName,
          value
        } as UpdateStageParameterRequest),
        resultPath: DISCARD
      });
    };

    // Is this atomic enough? Should we only update one place?
    const flipStage = (stage: string, manifestId: string) =>
      new Parallel(this, `flipStage${stage}`, { resultPath: DISCARD }).branch(
        flipStageTable(stage, manifestId),
        flipStageParameter(stage, manifestId)
      );

    const cleanAfterMergeAndValidate = new Pass(this, 'cleanBeforeTransforms', {
      parameters: {
        updated: JsonPath.stringAt('$.updated'),
        parentId: JsonPath.stringAt('$.current.id')
      }
    });

    const definition = preserveInput
      /// Accepts an input request structure
      /// Validates the input request structure (optional)
      /// Extracts group id (optional)
      /// Submits the deployment into the deployment table
      .next(submitToDynamo)
      /// Semaphore (can this be improved?)
      //// Submit the deployment into the deployment queue
      //// Checks to see if this deployment is the first in the queue
      .next(
        props.semaphore.requestLockAndWaitTask({
          id: JsonPath.stringAt('$$.Execution.Name'),
          groupId: DEFAULT_GROUP
        })
      )
      /// Update dynamo to reflect the job is starting to execute
      .next(
        updateDeploymentState(
          'deploymentStarted',
          DeploymentStatus.IN_PROGRESS,
          DeploymentStatus.WAITING
        )
      )
      /// Loads the current state at pFinal
      .next(getCurrentManifestId)
      .next(
        new Choice(this, 'containsId')
          .when(
            Condition.isNotPresent(
              `$.finalStageManifestId.Item.${DYNAMO_CONSTANTS.stage.manifestId}.S`
            ),
            new Pass(this, 'defaultManifest', {
              parameters: {
                manifest: emptyManifest,
                id: ''
              },
              resultPath: '$.current'
            })
          )
          .otherwise(
            updateDeploymentParent.next(getCurrentManifest).next(
              new Pass(this, 'extractManifest', {
                parameters: {
                  manifest: UnvalidatedJsonPath.stringAt(
                    `States.StringToJson($.finalStageManifestResults.Item.${DYNAMO_CONSTANTS.manifest.manifest}.S)`
                  ),
                  id: JsonPath.stringAt(
                    `$.finalStageManifestId.Item.${DYNAMO_CONSTANTS.stage.manifestId}.S`
                  )
                },
                resultPath: '$.current'
              })
            )
          )
          .afterwards()
      )
      .next(
        new Pass(this, 'cleanStateAfterManifestRetrieval', {
          parameters: {
            input: JsonPath.stringAt('$.input'),
            current: JsonPath.stringAt('$.current')
          }
        })
      )
      /// Merges input request with current state
      .next(merge)
      /// TODO check for errors from the previous step
      /// Validates the current state (optional)
      .next(
        validateManifest
          ? validateManifest
          : new Pass(this, 'noValidateManifest', { resultPath: DISCARD })
      )
      /// TODO handle validation result
      .next(cleanAfterMergeAndValidate)
      .next(
        new DynamoPutItem(this, 'saveManifest', {
          item: {
            [DYNAMO_CONSTANTS.manifest.id]: DynamoAttributeValue.fromString(
              JsonPath.stringAt('$$.Execution.Name')
            ),
            [DYNAMO_CONSTANTS.manifest
              .manifest]: DynamoAttributeValue.fromString(
              UnvalidatedJsonPath.stringAt(
                'States.JsonToString($.updated.manifest)'
              )
            ),
            [DYNAMO_CONSTANTS.manifest
              .created]: DynamoAttributeValue.fromString(
              JsonPath.stringAt('$$.State.EnteredTime')
            ),
            [DYNAMO_CONSTANTS.manifest.group]: DynamoAttributeValue.fromString(
              DEFAULT_GROUP
            ),
            [DYNAMO_CONSTANTS.manifest.parent]: DynamoAttributeValue.fromString(
              JsonPath.stringAt('$.parentId')
            )
          },
          table: props.infra.manifestTable,
          resultPath: DISCARD
        })
      )
      /// State Transformer Step(s) (sub step function or lambda function)
      //// TODO can transform steps be chained?
      //// TODO support multiple?
      .next(
        updatedManifestHook
          ? updatedManifestHook
          : new Pass(this, 'noUpdateHooks', { resultPath: DISCARD })
      )
      /// for each pre-FINAL stage
      .next(
        (props.stages || []).reduce((last, stage) => {
          return (
            last
              //// Update pInter with deployment ID
              .next(
                flipStage(stage.name, JsonPath.stringAt('$$.Execution.Name'))
              )
              .next(
                stage.prepareFuntion
                  ? new LambdaInvoke(this, `prepareStage${stage.name}`, {
                      lambdaFunction: stage.prepareFuntion.func,
                      resultPath: DISCARD,
                      payload: TaskInput.fromObject({}) // TODO figure this out
                    })
                  : new Pass(this, `noPrepare${stage.name}`, {
                      resultPath: DISCARD
                    })
              )
              //// Run test step(s) (sub step function or lambda function)
              .next(
                stage.testFunction
                  ? new LambdaInvoke(this, `testStage${stage.name}`, {
                      lambdaFunction: stage.testFunction.func,
                      resultPath: DISCARD,
                      payload: TaskInput.fromObject({}) // TODO figure this out
                    })
                  : new Pass(this, `noTest${stage.name}`, {
                      resultPath: DISCARD
                    })
              )
          );
        }, new Pass(this, 'StartStageDeployments', { resultPath: DISCARD }) as INextable & IChainable)
      )
      /// TODO support manual approval
      /// Promote to final stage
      .next(flipStage(FINAL_STAGE, JsonPath.stringAt('$$.Execution.Name')))
      /// Update dynamo to reflect the completed state
      .next(
        updateDeploymentState(
          'deploymentComplete',
          DeploymentStatus.SUCCESSFUL,
          DeploymentStatus.IN_PROGRESS
        )
      )
      .next(
        props.semaphore.relinquishLockTask({
          id: JsonPath.stringAt('$$.Execution.Name'),
          groupId: DEFAULT_GROUP
        })
      );

    this.machine = new StateMachine(this, 'deployer', {
      definition
    });
  }
}
