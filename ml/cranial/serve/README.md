# Serving the frozen cranial model

The frozen model (`../manifests/freeze_v2.json`) runs on a SageMaker async inference endpoint. The app backend (`backend/ai`) uploads a skull NRRD to S3, invokes the endpoint, and polls S3 for one ZIP holding `implant.nrrd`, `probability.nrrd` and `metadata.json`. Spec: `features/cranial-reconstruction-candidate/spec.md`.

## Settings

No credentials in files. Use `aws configure`, an AWS profile, or env credentials.

| Variable | Used by | Example |
|-|-|-|
| `S3_BUCKET` | deploy | your bucket |
| `SAGEMAKER_ROLE` | deploy | IAM role ARN with SageMaker + S3 access |
| `AWS_REGION` | both | `us-east-1` |
| `CRANIAL_ENDPOINT_NAME` | both | `cranial-unet-v2` (default) |
| `CRANIAL_INSTANCE_TYPE` | deploy | `ml.m5.xlarge` (default, CPU) |
| `CRANIAL_INFERENCE_BUCKET` | backend | same as `S3_BUCKET` |
| `CRANIAL_INFERENCE_PREFIX` | backend | `cranial/inference` (default) |

The backend reports `model-endpoint-unconfigured` until `CRANIAL_ENDPOINT_NAME` and `CRANIAL_INFERENCE_BUCKET` are set (for example in `backend/ai/.env`).

## Commands

Run these from the repo root, in an env with `sagemaker` and `boto3` installed.

```sh
python ml/cranial/serve/deploy_endpoint.py deploy   # checks the checkpoint hash against freeze_v2.json first
python ml/cranial/serve/deploy_endpoint.py status   # wait for InService
python ml/cranial/serve/deploy_endpoint.py warm     # before a demo: scale 0 → 1 (several minutes)
python ml/cranial/serve/deploy_endpoint.py delete   # after the demo: removes endpoint, config, model
```

## Cost

The endpoint scales to 0 instances when the queue is empty, after a 10-minute scale-in cooldown. At 0 it costs nothing, but the first request waits for an instance to start. Run `warm` before presenting. Always run `delete` when you're done. A forgotten endpoint at 1 instance bills by the hour.

## Not yet verified

These need the live run (plan step 12):
- the async payload limits
- scaling to 0 and the backlog metric
- cold-start time
- the inference image's install of `requirements.txt`

Record measured CPU inference time here after that run.

## Local test

```sh
python -m pytest ml/cranial/tests/test_serve.py   # hash refusal + outputs on the input grid, CPU, no AWS
```
