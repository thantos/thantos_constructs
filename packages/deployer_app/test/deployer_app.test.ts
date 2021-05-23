import * as cdk from 'aws-cdk-lib';
import * as DeployerApp from '../lib/deployer_app-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new DeployerApp.DeployerAppStack(app, 'MyTestStack');
    // THEN
    const actual = app.synth().getStackArtifact(stack.artifactId).template;
    expect(actual.Resources ?? {}).toEqual({});
});
