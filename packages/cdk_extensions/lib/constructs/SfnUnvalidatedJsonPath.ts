import { JsonPathToken } from 'aws-cdk-lib/lib/aws-stepfunctions/lib/json-path';

export class UnvalidatedJsonPath {
  static stringAt(path: string): string {
    return new JsonPathToken(path).toString();
  }
}
