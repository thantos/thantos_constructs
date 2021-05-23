import { IFunction } from "aws-cdk-lib/aws-lambda";

export type MDIntegration = LambdaMergeDeployIntegration; // Add step functions

interface LambdaMergeDeployIntegration {
  type: 'Lambda';
  func: IFunction;
}

export abstract class MergeDeployIntegration {
  static fromLambda(func: IFunction): LambdaMergeDeployIntegration {
    return {
      type: 'Lambda',
      func
    } as LambdaMergeDeployIntegration;
  }
}