import {
    Table,
    AttributeType,
    BillingMode,
    ITable
  } from 'aws-cdk-lib/aws-dynamodb';
  import { StringParameter } from 'aws-cdk-lib/aws-ssm';
  import { Construct } from 'constructs';
  import { DYNAMO_CONSTANTS, EMPTY_MANIFEST } from '../constants';
  
  export interface DeployInfraProps {
    stages: string[];
  }
  
  // Infra
  /// Deployments table -> Deployment Id to Request
  /// Manifests table -> Deployment Id to Manifest Result
  /// Stages table -> Stage Name to Deployment ID
  
  export class DeployInfra extends Construct {
    deploymentTable: ITable;
    stagesTable: ITable;
    manifestTable: ITable;
    parameters: Record<string, StringParameter>;
  
    constructor(scope: Construct, id: string, props: DeployInfraProps) {
      super(scope, id);
  
      this.parameters = props.stages.reduce(
        (col, stage) => ({
          ...col,
          [stage]: new StringParameter(this, 'ManifestId' + stage, {
            stringValue: EMPTY_MANIFEST
          })
        }),
        {} as Record<string, StringParameter>
      );
  
      const deploymentTable = (this.deploymentTable = new Table(
        this,
        'deploymentTable',
        {
          partitionKey: {
            name: DYNAMO_CONSTANTS.deployment.id,
            type: AttributeType.STRING
          },
          billingMode: BillingMode.PAY_PER_REQUEST
        }
      ));
  
      deploymentTable.addGlobalSecondaryIndex({
        indexName: DYNAMO_CONSTANTS.deployment.indexByCreated,
        sortKey: {
          name: DYNAMO_CONSTANTS.deployment.created,
          type: AttributeType.STRING
        },
        partitionKey: {
          name: DYNAMO_CONSTANTS.deployment.group,
          type: AttributeType.STRING
        }
      });
  
      this.stagesTable = new Table(this, 'stagesTable', {
        partitionKey: {
          name: DYNAMO_CONSTANTS.stage.stage,
          type: AttributeType.STRING
        },
        billingMode: BillingMode.PAY_PER_REQUEST
      });
  
      const manifestTable = (this.manifestTable = new Table(
        this,
        'manifestTable',
        {
          partitionKey: {
            name: DYNAMO_CONSTANTS.manifest.id,
            type: AttributeType.STRING
          },
          billingMode: BillingMode.PAY_PER_REQUEST
        }
      ));
  
      manifestTable.addGlobalSecondaryIndex({
        indexName: DYNAMO_CONSTANTS.manifest.indexByCreated,
        sortKey: {
          name: DYNAMO_CONSTANTS.manifest.created,
          type: AttributeType.STRING
        },
        partitionKey: {
          name: DYNAMO_CONSTANTS.manifest.group,
          type: AttributeType.STRING
        }
      });
    }
  }
  