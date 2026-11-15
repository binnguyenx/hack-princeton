"""SageMaker async inference client for the cranial model (cranial-reconstruction-candidate R3, D1).

Credentials come from the standard AWS chain (env, profile, instance role), never from source.
The handle is the JSON of the output/failure S3 locations SageMaker returns for one invocation.
"""
from __future__ import annotations

import io
import json
import os
from urllib.parse import urlparse
import zipfile

from .model_endpoint import EndpointPoll


def endpoint_from_env(environ=None) -> 'SageMakerAsyncEndpoint | None':
    """Build the client from CRANIAL_* settings; None when the endpoint isn't configured."""
    environ = os.environ if environ is None else environ
    name, bucket = environ.get('CRANIAL_ENDPOINT_NAME'), environ.get('CRANIAL_INFERENCE_BUCKET')
    if not name or not bucket:
        return None
    return SageMakerAsyncEndpoint(name, bucket, environ.get('CRANIAL_INFERENCE_PREFIX', 'cranial/inference'),
                                  region=environ.get('AWS_REGION') or environ.get('AWS_DEFAULT_REGION'))


def _split(uri):
    parsed = urlparse(uri)
    return parsed.netloc, parsed.path.lstrip('/')


class SageMakerAsyncEndpoint:
    def __init__(self, endpoint_name, bucket, prefix, *, region=None, s3=None, runtime=None):
        if s3 is None or runtime is None:
            import boto3
            session = boto3.session.Session(region_name=region)
            s3 = s3 or session.client('s3')
            runtime = runtime or session.client('sagemaker-runtime')
        self.endpoint_name, self.bucket, self.prefix = endpoint_name, bucket, prefix.strip('/')
        self.s3, self.runtime = s3, runtime

    def submit(self, run_id: str, nrrd: bytes) -> str:
        key = f'{self.prefix}/{run_id}/input.nrrd'
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=nrrd)
        response = self.runtime.invoke_endpoint_async(
            EndpointName=self.endpoint_name, InputLocation=f's3://{self.bucket}/{key}',
            ContentType='application/octet-stream', Accept='application/zip', InferenceId=run_id)
        return json.dumps({'output': response['OutputLocation'], 'failure': response.get('FailureLocation')})

    def _exists(self, uri):
        from botocore.exceptions import ClientError
        bucket, key = _split(uri)
        try:
            self.s3.head_object(Bucket=bucket, Key=key)
            return True
        except ClientError as error:
            if error.response.get('Error', {}).get('Code') in ('404', 'NoSuchKey', 'NotFound'):
                return False
            raise

    def _read(self, uri):
        bucket, key = _split(uri)
        return self.s3.get_object(Bucket=bucket, Key=key)['Body'].read()

    def poll(self, handle: str) -> EndpointPoll:
        locations = json.loads(handle)
        if self._exists(locations['output']):
            with zipfile.ZipFile(io.BytesIO(self._read(locations['output']))) as archive:
                return EndpointPoll(status='done', implant=archive.read('implant.nrrd'),
                                    probability=archive.read('probability.nrrd'),
                                    metadata=json.loads(archive.read('metadata.json')))
        if locations.get('failure') and self._exists(locations['failure']):
            return EndpointPoll(status='failed', error=self._read(locations['failure']).decode('utf-8', 'replace')[:500])
        return EndpointPoll(status='pending')
