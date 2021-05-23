import { Construct } from 'constructs';
import { FINAL_STAGE } from '../constants';
import { DeployerMachine } from './DeployerMachine';
import { SfnSemaphore } from '@thantos/sfn-semaphore';
import { DeployApis } from './DeployApi';
import { DeployStage } from './DeployStage';
import { DeployInfra } from './DeployInfra';
import { MDIntegration } from '../types';

export interface MergeDeployProps {
  mergeFunction: MDIntegration;
  validateManifestFunction?: MDIntegration;
  updatedManifestHook?: MDIntegration;
  stages?: DeployStage[];
}

// TODO support multiple final documents
/// (segregate by... stage, group id)
/// Promote between stages
/// Groups result is unique merge documents
/// Groups can be deployed concurrently
export class MergeDeploy extends Construct {
  machine: DeployerMachine;

  constructor(scope: Construct, id: string, props: MergeDeployProps) {
    super(scope, id);

    const stageNames = props.stages?.map((x) => x.name) || [];

    // Can we handle this with CDK instead?
    if (new Set(stageNames).size != stageNames?.length)
      throw Error('Cannot have duplicate stage names');

    const stages = [...stageNames, FINAL_STAGE]; // TODO support more stages

    // API - TODO
    /// Get Manifests
    /// Get Manifest at Stage
    /// Get/Put Deployment
    /// Get Deployments

    // Infra
    /// Deployment, Manifest, and Stage tables
    /// SSM Parameters for each stage
    const infra = new DeployInfra(this, 'infra', {
      stages
    });

    // Lock Queue
    /// SQS FIFO Queue
    const lockQueue = new SfnSemaphore(this, 'lock');

    // Deployer state machine
    this.machine = new DeployerMachine(this, 'deployer', {
        semaphore: lockQueue,
      infra,
      mergeFunction: props.mergeFunction,
      validateManifestFunction: props.validateManifestFunction,
      updatedManifestHook: props.updatedManifestHook,
      stages: props.stages
    });

    new DeployApis(this, 'apis', {
      deployer: this.machine,
      infra,
      stages: props.stages
    });
  }
}
