import {
    IntegrationPattern,
    Map,
    StateMachine,
    TaskInput
  } from 'aws-cdk-lib/aws-stepfunctions';
  import {
    EvaluateExpression,
    StepFunctionsStartExecution
  } from 'aws-cdk-lib/aws-stepfunctions-tasks';
  import { Construct } from 'constructs';
  import { UnvalidatedJsonPath } from '@thantos/cdk_extensions';
  import { MergeDeploy } from '@thantos/merge_deploy';
  
  export interface MergeDeployPerformanceTesterProps {
    mergeDeploy: MergeDeploy;
  }
  
  export class MergeDeployPerformanceTester extends Construct {
    constructor(
      scope: Construct,
      id: string,
      props: MergeDeployPerformanceTesterProps
    ) {
      super(scope, id);
  
      const definition = new EvaluateExpression(this, 'generateArray', {
        expression: '[...new Array($.instances)].map((x, i) => i)',
        resultPath: '$.instanceRecords'
      }).next(
        new Map(this, 'startMany', {
          itemsPath: '$.instanceRecords',
          parameters: TaskInput.fromObject({
            tenantId: UnvalidatedJsonPath.stringAt(
              "States.Format('test{}', $$.Map.Item.Value)"
            ),
            values: ['some value']
          }),
          resultPath: '$.executions'
        }).iterator(
          new StepFunctionsStartExecution(this, 'invokeMachine', {
            input: TaskInput.fromJsonPathAt('$.value'),
            integrationPattern: IntegrationPattern.RUN_JOB,
            stateMachine: props.mergeDeploy.machine.machine
          }).next(
            new EvaluateExpression(this, 'calcDiff', {
              expression: '($.StopDate - $.StartDate) / 1000'
            })
          )
        )
        // TODO compute max, avg, min
        // TODO record to somewhere?
      );
  
      new StateMachine(this, 'testerMachine', {
        definition
      });
    }
  }
  