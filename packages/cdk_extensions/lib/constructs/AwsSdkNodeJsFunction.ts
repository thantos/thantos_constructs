import { BundlingOptions, DockerImage, ILocalBundling, Stack } from "aws-cdk-lib";
import { Code, LayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as path from "path";
import { exec } from "../utils";

const AWS_SDK_LAYER_ID = "AWS_SDK_LAYER";

export class AwsSDKNodejsFunction extends NodejsFunction {
  constructor(scope: Construct, id: string, props: NodejsFunctionProps) {
    super(scope, id, {
      ...props,
      runtime: Runtime.NODEJS_14_X,
      bundling: {
        ...props.bundling,
        externalModules: [
          ...(props.bundling?.externalModules || []),
          "aws-sdk",
          "@aws-sdk/*",
        ],
      },
    });

    const stack = Stack.of(this);

    // As a singleton
    const awsSdkLayer =
      (stack.node.tryFindChild(AWS_SDK_LAYER_ID) as LayerVersion) ??
      new LayerVersion(stack, AWS_SDK_LAYER_ID, {
        code: Code.fromAsset(path.resolve("dist/layer"), { bundling: {
            local: new AwsSdkLocalBundle(),
            image: DockerImage.fromRegistry('dummy') 
        } }),
      });

    this.addLayers(awsSdkLayer);
  }
}

class AwsSdkLocalBundle implements ILocalBundling {
    // TODO: support more platforms and be smarter
    // TODO: Test this
    tryBundle(outputDir: string, options: BundlingOptions): boolean {
        exec('bash', ['-c', [`mkdir -p dist/layer/nodejs && cp package-lock.json dist/layer/nodejs/ && npm install $(npm ls --parseable | grep @aws-sdk | rev | cut -d'/' -f 1,2 | rev | tr '\n\r' ' ') --prefix dist/layer/nodejs`].join()] )
        return true;
    }
}