export const emptyManifest = {}; // TODO support a value from the developer.

export const DYNAMO_CONSTANTS = {
  deployment: {
    id: 'id',
    input: 'input',
    state: 'state',
    created: 'created',
    updated: 'updated',
    indexByCreated: 'byGroupCreated',
    group: 'group',
    parent: 'parent'
  },
  stage: {
    stage: 'stage',
    manifestId: 'manifestId'
  },
  manifest: {
    id: 'id',
    manifest: 'manifest',
    created: 'created',
    indexByCreated: 'byGroupCreated',
    group: 'group',
    parent: 'parent'
  }
};

export enum DeploymentStatus {
  SUCCESSFUL = 'SUCCESSFUL',
  WAITING = 'WAITING',
  IN_PROGRESS = 'IN_PROGRESS',
  FAILED = 'FAILED'
}

export const DEFAULT_GROUP = 'DEFAULT';

export const EMPTY_MANIFEST = '__EMPTY';

export const FINAL_STAGE = 'FINAL';
