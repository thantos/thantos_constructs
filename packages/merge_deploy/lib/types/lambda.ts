import { Handler } from 'aws-lambda';

export interface MergeRequest<T, R> {
  manifest: R;
  request: T;
}

// TODO: Support warnings?
// TODO: Or should we just let the lambda throw and error instead?
export interface MergeResponse<R> {
  manifest?: R;
  errors?: string[];
}

export type MergeHandler<T, R> = Handler<MergeRequest<T, R>, MergeResponse<R>>;

export interface ValidateRequestRequest<T> {
  request: T;
}

export interface ValidateResponse {
  valid: boolean;
  errors?: string[];
}

export type ValidateRequestHandler<T> = Handler<
  ValidateRequestRequest<T>,
  ValidateResponse
>;

export interface ValidateManifestRequest<R> {
  current: R;
  updated: R;
}

export type ValidateManifestHandler<R> = Handler<
  ValidateManifestRequest<R>,
  ValidateResponse
>;

export interface StateTransformRequest<R> {
  manifest: R;
  manifestId: string;
}

// TODO allow returning information about the generated resources?
export type StateTransformerHandler<R> = Handler<StateTransformRequest<R>>;
