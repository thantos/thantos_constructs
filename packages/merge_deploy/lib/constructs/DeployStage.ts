import { Names } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MDIntegration } from '../types';

export interface DeployStageProps {
  name?: string;
  testFunction?: MDIntegration;
  prepareFuntion?: MDIntegration;
}

export class DeployStage extends Construct {
  readonly name: string;
  readonly testFunction?: MDIntegration;
  readonly prepareFuntion?: MDIntegration;

  constructor(
    scope: Construct,
    id: string,
    props: DeployStageProps
  ) {
    super(scope, id);

    this.name = props.name || Names.nodeUniqueId(this.node);
    this.testFunction = props.testFunction;
    this.prepareFuntion = props.prepareFuntion;
  }
}
