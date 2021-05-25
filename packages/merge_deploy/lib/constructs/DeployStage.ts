import { Names } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MDIntegration } from '../types';

export interface DeployStageProps {
  name?: string;
  testFunction?: MDIntegration;
  prepareFunction?: MDIntegration;
}

export class DeployStage extends Construct {
  readonly name: string;
  readonly testFunction?: MDIntegration;
  readonly prepareFunction?: MDIntegration;

  constructor(
    scope: Construct,
    id: string,
    props: DeployStageProps
  ) {
    super(scope, id);

    this.name = props.name || Names.nodeUniqueId(this.node);
    this.testFunction = props.testFunction;
    this.prepareFunction = props.prepareFunction;
  }
}
