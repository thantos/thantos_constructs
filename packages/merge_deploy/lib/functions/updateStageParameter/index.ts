import { Handler } from 'aws-lambda';
import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const SSM = new SSMClient({});

export interface UpdateStageParameterRequest {
  parameterName: string;
  value: string;
}

export const handler: Handler<UpdateStageParameterRequest> = async (event) => {
  await SSM.send(
    new PutParameterCommand({
      Name: event.parameterName,
      Value: event.value,
      Overwrite: true
    })
  );
};
