import {
    AwsIntegration,
    MethodOptions,
    MockIntegration,
    RestApi
  } from 'aws-cdk-lib/lib/aws-apigateway';
  import { Role, ServicePrincipal } from 'aws-cdk-lib/lib/aws-iam';
  import { Construct } from 'constructs';
  import { DEFAULT_GROUP, DYNAMO_CONSTANTS, FINAL_STAGE } from '../constants';
  import { DeployerMachine } from './DeployerMachine';
  import { DeployStage } from './DeployStage';
  import { DeployInfra } from './DeployInfra';
  
  export interface DeployApisProps {
    deployer: DeployerMachine;
    infra: DeployInfra;
    stages?: DeployStage[];
  }
  
  export class DeployApis extends Construct {
    constructor(scope: Construct, id: string, props: DeployApisProps) {
      super(scope, id);
      const api = new RestApi(this, 'api');
  
      const apiRoot = api.root;
      apiRoot.addMethod(
        'GET',
        new MockIntegration({
          integrationResponses: [
            {
              statusCode: '200',
              responseTemplates: {
                'application/json': `{ groups: ["${DEFAULT_GROUP}"] }`
              }
            }
          ]
        })
      );
  
      const deploymentsEndpoint = apiRoot.addResource('deployments');
      const deploymentEndpoint = deploymentsEndpoint.addResource('{id}');
      const manifestsEndpoint = apiRoot.addResource('manifests');
      const manifestEndpoint = manifestsEndpoint.addResource('{id}');
      const stagesEndpoint = apiRoot.addResource('stages');
  
      const apiGatewayIntegRole = new Role(this, 'apiGateWayRole', {
        assumedBy: new ServicePrincipal('apigateway.amazonaws.com')
      });
  
      props.deployer.machine.grantStartExecution(apiGatewayIntegRole);
      props.infra.deploymentTable.grantReadData(apiGatewayIntegRole);
      props.infra.manifestTable.grantReadData(apiGatewayIntegRole);
      props.infra.stagesTable.grantReadData(apiGatewayIntegRole);
  
      const methodOptions: MethodOptions = {
        methodResponses: [{ statusCode: '200' }]
      };
  
      deploymentsEndpoint.addMethod(
        'POST',
        new AwsIntegration({
          service: 'states',
          action: 'StartExecution',
          integrationHttpMethod: 'POST',
          options: {
            credentialsRole: apiGatewayIntegRole,
            requestTemplates: {
              'application/json': `{
                  "input": "$util.escapeJavaScript($input.json('$'))",
                  "stateMachineArn": "${props.deployer.machine.stateMachineArn}"
              }`
            },
            integrationResponses: [{ statusCode: '200' }]
          }
        }),
        methodOptions
      );
  
      // TODO get by group
      deploymentsEndpoint.addMethod(
        'GET',
        new AwsIntegration({
          service: 'dynamodb',
          action: 'Query',
          options: {
            credentialsRole: apiGatewayIntegRole,
            requestTemplates: {
              'application/json': `{
                  "ScanIndexForward": false,
                  "IndexName": "${DYNAMO_CONSTANTS.deployment.indexByCreated}",
                  "TableName": "${props.infra.deploymentTable.tableName}",
                  "KeyConditionExpression": "#group = :group",
                  "ExpressionAttributeNames": {
                      "#group": "${DYNAMO_CONSTANTS.manifest.group}"
                  },
                  "ExpressionAttributeValues": {
                      ":group": { 
                          "S": "${DEFAULT_GROUP}"
                      }
                  }
              }`
            },
            integrationResponses: [
              {
                statusCode: '200',
                responseTemplates: {
                  'application/json': `{
      #set($context.responseOverride.header.CacheControl = 'no-cache')
      "deployments": [
          #set($root = $input.path('$'))
          #foreach($deployment in $root.Items)
              {
                  "id": "$deployment.${DYNAMO_CONSTANTS.deployment.id}.S",
                  "status": "$deployment.${DYNAMO_CONSTANTS.deployment.state}.S",
                  "input": $deployment.${DYNAMO_CONSTANTS.deployment.input}.S,
                  "created": "$deployment.${DYNAMO_CONSTANTS.deployment.created}.S",
                  "updated": "$deployment.${DYNAMO_CONSTANTS.deployment.updated}.S",
                  "parent": "$deployment.${DYNAMO_CONSTANTS.deployment.parent}.S"
              }#if($foreach.hasNext),#end
          #end        
      ]
  }`
                }
              }
            ]
          }
        }),
        methodOptions
      );
  
      deploymentEndpoint.addMethod(
        'GET',
        new AwsIntegration({
          service: 'dynamodb',
          action: 'GetItem',
          options: {
            credentialsRole: apiGatewayIntegRole,
            requestTemplates: {
              'application/json': `{
                  "Key": {
                      "${DYNAMO_CONSTANTS.deployment.id}": {
                          "S": "$method.request.path.id"
                      }
                  },
                  "TableName": "${props.infra.deploymentTable.tableName}"
              }`
            },
            integrationResponses: [
              {
                statusCode: '200',
                responseTemplates: {
                  'application/json': `{
      #set($root = $input.path('$'))
      "status": "$root.Item.${DYNAMO_CONSTANTS.deployment.state}.S",
      "input": $root.Item.${DYNAMO_CONSTANTS.deployment.input}.S,
      "created": "$root.Item.${DYNAMO_CONSTANTS.deployment.created}.S",
      "updated": "$root.Item.${DYNAMO_CONSTANTS.deployment.updated}.S",
      "parent": "$root.Item.${DYNAMO_CONSTANTS.deployment.parent}.S"
  }`
                }
              }
            ]
          }
        }),
        methodOptions
      );
  
      // TODO get by group
      manifestsEndpoint.addMethod(
        'GET',
        new AwsIntegration({
          service: 'dynamodb',
          action: 'Query',
          options: {
            credentialsRole: apiGatewayIntegRole,
            requestTemplates: {
              'application/json': `{
                        "ScanIndexForward": false,
                        "IndexName": "${DYNAMO_CONSTANTS.manifest.indexByCreated}",
                        "TableName": "${props.infra.manifestTable.tableName}",
                        "KeyConditionExpression": "#group = :group",
                        "ExpressionAttributeNames": {
                            "#group": "${DYNAMO_CONSTANTS.manifest.group}"
                        },
                        "ExpressionAttributeValues": {
                          ":group": { 
                              "S": "${DEFAULT_GROUP}"
                          }
                        }
                    }`
            },
            integrationResponses: [
              {
                statusCode: '200',
                responseTemplates: {
                  'application/json': `{
            #set($context.responseOverride.header.CacheControl = 'no-cache')
            "manifests": [
              #set($root = $input.path('$'))
              #foreach($manifest in $root.Items)
                    {
                        "id": "$manifest.${DYNAMO_CONSTANTS.manifest.id}.S",
                        "manifest": $manifest.${DYNAMO_CONSTANTS.manifest.manifest}.S,
                        "created": "$manifest.${DYNAMO_CONSTANTS.manifest.created}.S",
                        "parent": "$manifest.${DYNAMO_CONSTANTS.manifest.parent}.S"
                    }#if($foreach.hasNext),#end
                #end        
            ]
        }`
                }
              }
            ]
          }
        }),
        methodOptions
      );
  
      manifestEndpoint.addMethod(
        'GET',
        new AwsIntegration({
          service: 'dynamodb',
          action: 'GetItem',
          options: {
            credentialsRole: apiGatewayIntegRole,
            requestTemplates: {
              'application/json': `{
                    "Key": {
                        "${DYNAMO_CONSTANTS.manifest.id}": {
                            "S": "$method.request.path.id"
                        }
                    },
                    "TableName": "${props.infra.manifestTable.tableName}"
                }`
            },
            integrationResponses: [
              {
                statusCode: '200',
                responseTemplates: {
                  'application/json': `{
      #set($root = $input.path('$'))
      "manifest": $root.Item.${DYNAMO_CONSTANTS.manifest.manifest}.S,
      "created": "$root.Item.${DYNAMO_CONSTANTS.manifest.created}.S",
      "parent": "$root.Item.${DYNAMO_CONSTANTS.manifest.parent}.S"
    }`
                }
              }
            ]
          }
        }),
        methodOptions
      );
  
      // TODO support multiple groups
      stagesEndpoint.addMethod(
        'GET',
        new AwsIntegration({
          service: 'dynamodb',
          action: 'Scan',
          options: {
            credentialsRole: apiGatewayIntegRole,
            requestTemplates: {
              'application/json': `{
                    "TableName": "${props.infra.stagesTable.tableName}"
                }`
            },
            integrationResponses: [
              {
                statusCode: '200',
                responseTemplates: {
                  'application/json': `{
                      #set($context.responseOverride.header.CacheControl = 'no-cache')
                      "stages": [
                      #set($stages = [${
                        props.stages
                          ? props.stages
                              .map((stage) => `"${stage.name}"`)
                              .join(',')
                          : []
                      }${
                    props.stages && props.stages.length > 0 ? ',' : ''
                  }"${FINAL_STAGE}"])
                      #set($root = $input.path('$'))
                      #foreach($stage in $stages)
                          #foreach($item in $root.Items)
                              #if($item.${
                                DYNAMO_CONSTANTS.stage.stage
                              }.S == $stage)
                                  {
                                      "name": "$stage",
                                      "manifestId": "$item.${
                                        DYNAMO_CONSTANTS.stage.manifestId
                                      }.S"
                                  }
                              #end
                          #end
                          #if($foreach.hasNext),#end
                      #end
                      ]
    }`
                }
              }
            ]
          }
        }),
        methodOptions
      );
    }
  }
  