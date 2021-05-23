import { MergeHandler } from "@thantos/merge_deploy";

export interface TestRequest {
  tenantId: string;
  values: string[];
  command?: 'CLEAR' | 'MERGE'; // default merge
}

export interface TestManifestV0 {
  [tenantId: string]: string[];
}

export interface TestManifestV1 {
  version: '1';
  count: number;
  tenants: Record<string, TenantRecordV1>;
}

export interface TenantRecordV1 {
  recentValues: string[];
  uniqueValues: string[];
  count: number;
}

type TestManifest = TestManifestV0 | TestManifestV1;

export const handler: MergeHandler<TestRequest, TestManifest> = (event) => {
  // convert to v1
  const manifestV1: TestManifestV1 =
    event.manifest.version === '1'
      ? (event.manifest as TestManifestV1)
      : ({
          count: 1,
          tenants: Object.entries(event.manifest).reduce(
            (acc, [id, values]) => ({
              ...acc,
              [id]: {
                count: 1,
                recentValues: values,
                uniqueValues: values
              } as TenantRecordV1
            }),
            {} as Record<string, TenantRecordV1>
          )
        } as TestManifestV1);

  const tenantRecord = manifestV1.tenants[event.request.tenantId] || {
    count: 0,
    uniqueValues: [],
    recentValues: []
  };

  const clear = event.request.command === 'CLEAR';

  return Promise.resolve({
    manifest: {
      version: '1',
      count: clear ? 1 : manifestV1.count + 1,
      tenants: {
        ...(clear ? {} : manifestV1.tenants),
        [event.request.tenantId]: {
          count: tenantRecord.count + 1,
          recentValues: event.request.values,
          uniqueValues: [
            ...new Set([...event.request.values, ...tenantRecord.uniqueValues])
          ]
        }
      }
    }
  });
};
