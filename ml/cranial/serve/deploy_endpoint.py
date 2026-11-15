"""Deploy, warm, inspect and delete the cranial SageMaker async endpoint (cranial-reconstruction-candidate R4).

    python ml/cranial/serve/deploy_endpoint.py deploy   # package checkpoint + freeze + code, create endpoint
    python ml/cranial/serve/deploy_endpoint.py warm     # scale to 1 instance before a demo
    python ml/cranial/serve/deploy_endpoint.py status
    python ml/cranial/serve/deploy_endpoint.py delete   # stop all charges

Settings come from env (no credentials in this file): S3_BUCKET, SAGEMAKER_ROLE (ARN), AWS_REGION,
optionally CRANIAL_ENDPOINT_NAME (default cranial-unet-v2), CRANIAL_INSTANCE_TYPE (default ml.m5.xlarge),
CRANIAL_CHECKPOINT_S3 (default s3://$S3_BUCKET/cranial/checkpoints/<run_id from freeze>/best.pt).
Not exercised by CI; verified only by the live run in plan step 12.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tarfile
import tempfile

HERE = Path(__file__).resolve().parent
CRANIAL = HERE.parent
FREEZE = CRANIAL / 'manifests' / 'freeze_v2.json'
CODE_FILES = [HERE / 'inference.py', HERE / 'requirements.txt', CRANIAL / 'predict.py', CRANIAL / 'train.py',
              CRANIAL / 'prepare_data.py']


def settings():
    bucket = os.environ.get('S3_BUCKET')
    if not bucket:
        raise SystemExit('Set S3_BUCKET')
    freeze = json.loads(FREEZE.read_text())
    return {
        'bucket': bucket, 'region': os.environ.get('AWS_REGION', 'us-east-1'), 'role': os.environ.get('SAGEMAKER_ROLE'),
        'name': os.environ.get('CRANIAL_ENDPOINT_NAME', 'cranial-unet-v2'),
        'instance': os.environ.get('CRANIAL_INSTANCE_TYPE', 'ml.m5.xlarge'),
        'checkpoint': os.environ.get('CRANIAL_CHECKPOINT_S3',
                                     f"s3://{bucket}/cranial/checkpoints/{freeze['run_id']}/best.pt"),
        'freeze': freeze,
    }


def _sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            digest.update(chunk)
    return 'sha256:' + digest.hexdigest()


def package(cfg, s3, workdir):
    """model.tar.gz = model.pt + freeze.json; refuses a checkpoint that doesn't match the freeze hash."""
    bucket, key = cfg['checkpoint'][5:].split('/', 1)
    checkpoint = workdir / 'model.pt'
    s3.download_file(bucket, key, str(checkpoint))
    if _sha256(checkpoint) != cfg['freeze']['checkpoint_hash']:
        raise SystemExit(f"Checkpoint at {cfg['checkpoint']} does not match freeze_v2.json; refusing to deploy")
    shutil.copy(FREEZE, workdir / 'freeze.json')
    archive = workdir / 'model.tar.gz'
    with tarfile.open(archive, 'w:gz') as tar:
        tar.add(checkpoint, 'model.pt')
        tar.add(workdir / 'freeze.json', 'freeze.json')
    key = f"cranial/serving/{cfg['freeze']['run_id']}/model.tar.gz"
    s3.upload_file(str(archive), cfg['bucket'], key)
    code = workdir / 'code'
    code.mkdir()
    for path in CODE_FILES:
        shutil.copy(path, code / path.name)
    return f"s3://{cfg['bucket']}/{key}", code


def deploy(cfg):
    import boto3
    import sagemaker
    from sagemaker.async_inference import AsyncInferenceConfig
    from sagemaker.pytorch import PyTorchModel
    if not cfg['role']:
        raise SystemExit('Set SAGEMAKER_ROLE')
    session = boto3.session.Session(region_name=cfg['region'])
    with tempfile.TemporaryDirectory() as directory:
        model_data, code = package(cfg, session.client('s3'), Path(directory))
        model = PyTorchModel(model_data=model_data, role=cfg['role'], entry_point='inference.py', source_dir=str(code),
                             framework_version='2.1.0', py_version='py310',
                             sagemaker_session=sagemaker.Session(boto_session=session))
        model.deploy(initial_instance_count=1, instance_type=cfg['instance'], endpoint_name=cfg['name'],
                     async_inference_config=AsyncInferenceConfig(
                         output_path=f"s3://{cfg['bucket']}/cranial/inference/output",
                         failure_path=f"s3://{cfg['bucket']}/cranial/inference/failure",
                         max_concurrent_invocations_per_instance=1))
    scale_to_zero_when_idle(cfg, session)
    print(f"Endpoint {cfg['name']} deployed on {cfg['instance']}; scales to 0 when idle.")


def scale_to_zero_when_idle(cfg, session):
    """Min 0 / max 1 instances on queue backlog, so an idle endpoint costs nothing (cold start applies)."""
    autoscaling = session.client('application-autoscaling')
    resource = f"endpoint/{cfg['name']}/variant/AllTraffic"
    autoscaling.register_scalable_target(ServiceNamespace='sagemaker', ResourceId=resource,
                                         ScalableDimension='sagemaker:variant:DesiredInstanceCount',
                                         MinCapacity=0, MaxCapacity=1)
    autoscaling.put_scaling_policy(
        PolicyName=f"{cfg['name']}-backlog", ServiceNamespace='sagemaker', ResourceId=resource,
        ScalableDimension='sagemaker:variant:DesiredInstanceCount', PolicyType='TargetTrackingScaling',
        TargetTrackingScalingPolicyConfiguration={
            'TargetValue': 1.0, 'ScaleInCooldown': 600, 'ScaleOutCooldown': 60,
            'CustomizedMetricSpecification': {'MetricName': 'ApproximateBacklogSizePerInstance', 'Namespace': 'AWS/SageMaker',
                                              'Dimensions': [{'Name': 'EndpointName', 'Value': cfg['name']}],
                                              'Statistic': 'Average'}})


def warm(cfg):
    import boto3
    client = boto3.session.Session(region_name=cfg['region']).client('sagemaker')
    client.update_endpoint_weights_and_capacities(EndpointName=cfg['name'], DesiredWeightsAndCapacities=[
        {'VariantName': 'AllTraffic', 'DesiredInstanceCount': 1}])
    print(f"Scaling {cfg['name']} to 1 instance. Run `status` until InService; idle scale-in returns it to 0.")


def status(cfg):
    import boto3
    client = boto3.session.Session(region_name=cfg['region']).client('sagemaker')
    endpoint = client.describe_endpoint(EndpointName=cfg['name'])
    variants = [(v['VariantName'], v.get('CurrentInstanceCount')) for v in endpoint.get('ProductionVariants', [])]
    print(endpoint['EndpointStatus'], variants)


def delete(cfg):
    import boto3
    client = boto3.session.Session(region_name=cfg['region']).client('sagemaker')
    config = client.describe_endpoint(EndpointName=cfg['name'])['EndpointConfigName']
    models = [v['ModelName'] for v in client.describe_endpoint_config(EndpointConfigName=config)['ProductionVariants']]
    client.delete_endpoint(EndpointName=cfg['name'])
    client.delete_endpoint_config(EndpointConfigName=config)
    for model in models:
        client.delete_model(ModelName=model)
    print(f"Deleted endpoint {cfg['name']}, its config and model(s). No further instance charges.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('action', choices=['deploy', 'warm', 'status', 'delete'])
    action = parser.parse_args().action
    {'deploy': deploy, 'warm': warm, 'status': status, 'delete': delete}[action](settings())
