import { ValidateManifestHandler } from '@thantos/merge_deploy';
import { TestManifestV1 } from '../merge';

export const handler: ValidateManifestHandler<TestManifestV1> = () => {
  return Promise.resolve({
    valid: true
  });
};
