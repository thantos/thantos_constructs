# `@thantos/merge_deploy_tester`

Step Function which starts many executions against the Merge Deploy system to test concurrency, throughput, and resilience.

Features:

* Start many executions.
* Measure execution time + delay.
* Measure throughput - Coming Soon
* Automation - Coming Soon
* API - Coming Soon

## Usage

```ts
import { DeployStage, MergeDeploy, MergeDeployIntegration } from '@thantos/merge_deploy';
import { MergeDeployPerformanceTester } from '@thantos/merge_deploy_tester';

const md = new MergeDeploy(this, 'mergeDeploy', { ... });

new MergeDeployPerformanceTester(this, 'tester', {
    mergeDeploy: md
});
```

* Go to step function ui
* find the tester machine
* start an execution

```json
{
    "instances": <number>,
    "value": <object> // your input payload
}
```
