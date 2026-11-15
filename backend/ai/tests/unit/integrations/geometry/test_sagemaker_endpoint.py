"""SageMaker async client call shapes with stubbed boto3 (cranial-reconstruction-candidate R3); no network."""
import io
import json
import unittest
import zipfile

import boto3
from botocore.response import StreamingBody
from botocore.stub import ANY, Stubber

from skullfix_ai.integrations.geometry.sagemaker_endpoint import SageMakerAsyncEndpoint, endpoint_from_env

CONFIG = {'CRANIAL_ENDPOINT_NAME': 'cranial-unet-v2', 'CRANIAL_INFERENCE_BUCKET': 'bucket',
          'CRANIAL_INFERENCE_PREFIX': 'cranial/inference', 'AWS_REGION': 'us-east-1'}


def body(data):
    return StreamingBody(io.BytesIO(data), len(data))


def outputs_zip():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        archive.writestr('implant.nrrd', b'implant')
        archive.writestr('probability.nrrd', b'probability')
        archive.writestr('metadata.json', json.dumps({'threshold': 0.5}))
    return buffer.getvalue()


class SageMakerEndpointTest(unittest.TestCase):
    def setUp(self):
        session = boto3.session.Session(aws_access_key_id='test', aws_secret_access_key='test', region_name='us-east-1')
        self.s3, self.runtime = session.client('s3'), session.client('sagemaker-runtime')
        self.s3_stub, self.runtime_stub = Stubber(self.s3), Stubber(self.runtime)
        self.s3_stub.activate()
        self.runtime_stub.activate()
        self.endpoint = SageMakerAsyncEndpoint('cranial-unet-v2', 'bucket', 'cranial/inference', s3=self.s3, runtime=self.runtime)

    def tearDown(self):
        self.s3_stub.assert_no_pending_responses()
        self.runtime_stub.assert_no_pending_responses()

    def submitted(self):
        self.s3_stub.add_response('put_object', {}, {'Bucket': 'bucket', 'Key': 'cranial/inference/run-1/input.nrrd', 'Body': ANY})
        self.runtime_stub.add_response(
            'invoke_endpoint_async',
            {'OutputLocation': 's3://bucket/cranial/inference/output/run-1.out',
             'FailureLocation': 's3://bucket/cranial/inference/failure/run-1.out', 'InferenceId': 'run-1'},
            {'EndpointName': 'cranial-unet-v2', 'InputLocation': 's3://bucket/cranial/inference/run-1/input.nrrd',
             'ContentType': 'application/octet-stream', 'Accept': 'application/zip', 'InferenceId': 'run-1'})
        return self.endpoint.submit('run-1', b'NRRD0005')

    def test_missing_config_gives_no_endpoint(self):
        for missing in ('CRANIAL_ENDPOINT_NAME', 'CRANIAL_INFERENCE_BUCKET'):
            with self.subTest(missing):
                self.assertIsNone(endpoint_from_env({k: v for k, v in CONFIG.items() if k != missing}))

    def test_submit_uploads_input_then_invokes_async_endpoint(self):
        handle = self.submitted()
        self.assertIn('run-1.out', handle)

    def test_poll_is_pending_until_output_exists_then_unpacks_zip(self):
        handle = self.submitted()
        for key in ('output', 'failure'):
            self.s3_stub.add_client_error('head_object', service_error_code='404', http_status_code=404,
                                          expected_params={'Bucket': 'bucket', 'Key': f'cranial/inference/{key}/run-1.out'})
        self.assertEqual(self.endpoint.poll(handle).status, 'pending')
        self.s3_stub.add_response('head_object', {}, {'Bucket': 'bucket', 'Key': 'cranial/inference/output/run-1.out'})
        self.s3_stub.add_response('get_object', {'Body': body(outputs_zip())},
                                  {'Bucket': 'bucket', 'Key': 'cranial/inference/output/run-1.out'})
        done = self.endpoint.poll(handle)
        self.assertEqual((done.status, done.implant, done.probability, done.metadata),
                         ('done', b'implant', b'probability', {'threshold': 0.5}))

    def test_poll_reports_failure_object_text(self):
        handle = self.submitted()
        self.s3_stub.add_client_error('head_object', service_error_code='404', http_status_code=404,
                                      expected_params={'Bucket': 'bucket', 'Key': 'cranial/inference/output/run-1.out'})
        self.s3_stub.add_response('head_object', {}, {'Bucket': 'bucket', 'Key': 'cranial/inference/failure/run-1.out'})
        self.s3_stub.add_response('get_object', {'Body': body(b'ModelError: CUDA out of memory')},
                                  {'Bucket': 'bucket', 'Key': 'cranial/inference/failure/run-1.out'})
        failed = self.endpoint.poll(handle)
        self.assertEqual((failed.status, failed.error), ('failed', 'ModelError: CUDA out of memory'))


if __name__ == '__main__':
    unittest.main()
