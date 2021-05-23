import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DeployStage, MergeDeploy, MergeDeployIntegration } from '@thantos/merge_deploy';
import { AwsSDKNodejsFunction } from '@thantos/cdk_extensions';
import { MergeDeployPerformanceTester } from '@thantos/merge_deploy_tester';
import * as path from 'path';

export class DeployerAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const validateManifestFunction = new AwsSDKNodejsFunction(
      this,
      'validateManifestFunction',
      {
        entry: path.resolve('lib/functions/validateManifest/index.ts')
      }
    );

    const mergeFunction = new AwsSDKNodejsFunction(this, 'mergeFunction', {
      entry: path.resolve('lib/functions/merge/index.ts')
    });

    // TODO: make this a parameter.
    const stateTransformFunction = new AwsSDKNodejsFunction(
      this,
      'stateTransformFunction',
      {
        entry: path.resolve('lib/functions/transform/index.ts')
      }
    );

    const smd = new MergeDeploy(this, 'mergeDeploy', {
      mergeFunction: MergeDeployIntegration.fromLambda(mergeFunction),
      validateManifestFunction: MergeDeployIntegration.fromLambda(
        validateManifestFunction
      ),
      updatedManifestHook: MergeDeployIntegration.fromLambda(
        stateTransformFunction
      ),
      stages: [
        new DeployStage(this, 'firstStage', {
          name: 'first'
        })
      ]
    });

    new MergeDeployPerformanceTester(this, 'tester', {
      mergeDeploy: smd
    });
  }
}
