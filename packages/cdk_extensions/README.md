# `@thantos/cdk_extensions`

Some helpful CDK constructs, either not supported currently, in a future CDK version, or solving small but common issues.

* AwsSDKNodejsFunction - Wraps NodejsFunction. Uses and Deploys a singleton layer which contains all declared aws-sdk nodejs 3.0 dependencies.
* Sfn Partial Choice - Creates a Sfn Choice task that only adds the next step to explicitly given tasks. Useful when one or more branches DO NOT continue to the same task.
* UnvalidJsonPath - Simple replacement for JsonPath that doesn't validate the jsonpath, allowing for currently unsupported paths like Intrinsic Functions (`States.format('Something.{}', $.my.state)`).

## Usage

### AwsSDKNodejsFunction

```typescript
import { AwsSDKNodejsFunction } from '@thantos/cdk_extensions';

const validateManifestFunction = new AwsSDKNodejsFunction(this, 'myFunction', {
        entry: path.resolve(__dirname, 'somepath.ts')
    }
);
```
