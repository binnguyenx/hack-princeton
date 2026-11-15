"""Provider selection: Gemini or AWS Bedrock (langchain-aws), constructed offline."""
import os
import unittest
from unittest import mock

from skullfix_ai.agent.gemini_graph import (BEDROCK_DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDERS, bedrock_model_id,
                                            bedrock_readiness, chat_agent_for, make_bedrock_model, reasoning_text)
from skullfix_ai.tools.clinical_calc_tools import build_clinical_calc_tools


class ProviderTest(unittest.TestCase):
    def test_registry_modes(self):
        self.assertEqual(chat_agent_for('bedrock').mode, 'bedrock-read-only')
        self.assertEqual(chat_agent_for('gemini').mode, 'gemini-read-only')
        self.assertEqual(set(PROVIDERS), {'gemini', 'bedrock'})
        self.assertEqual(DEFAULT_PROVIDER, 'bedrock')

    def test_bedrock_model_id_precedence_and_default(self):
        clean = {k: v for k, v in os.environ.items() if k not in ('SKULLFIX_BEDROCK_MODEL', 'SKULLFIX_AI_MODEL_ID')}
        with mock.patch.dict(os.environ, clean, clear=True):
            self.assertEqual(bedrock_model_id(), BEDROCK_DEFAULT_MODEL)
            self.assertEqual(BEDROCK_DEFAULT_MODEL, 'us.anthropic.claude-3-7-sonnet-20250219-v1:0')
        with mock.patch.dict(os.environ, {**clean, 'SKULLFIX_AI_MODEL_ID': 'legacy.model'}, clear=True):
            self.assertEqual(bedrock_model_id(), 'legacy.model')
        with mock.patch.dict(os.environ, {**clean, 'SKULLFIX_AI_MODEL_ID': 'legacy.model', 'SKULLFIX_BEDROCK_MODEL': 'new.model'}, clear=True):
            self.assertEqual(bedrock_model_id(), 'new.model')

    def test_bedrock_readiness_checks_region_and_credentials_locally(self):
        keep = {k: v for k, v in os.environ.items() if not k.startswith('AWS_')}
        with mock.patch.dict(os.environ, {**keep, 'AWS_REGION': 'us-east-2'}, clear=True), \
                mock.patch('boto3.Session.get_credentials', return_value=None):
            ready, reason = bedrock_readiness()
            self.assertFalse(ready)
            self.assertIn('credentials', reason)
        with mock.patch.dict(os.environ, {**keep, 'AWS_REGION': 'us-east-2', 'AWS_ACCESS_KEY_ID': 'AKIAEXAMPLE',
                                          'AWS_SECRET_ACCESS_KEY': 'x' * 40}, clear=True):
            self.assertEqual(bedrock_readiness(), (True, None))
        with mock.patch.dict(os.environ, keep, clear=True), mock.patch('boto3.Session.region_name', None):
            self.assertFalse(bedrock_readiness()[0])

    def test_bedrock_model_constructs_and_binds_tools_without_network(self):
        fake = {'SKULLFIX_BEDROCK_MODEL': 'example.model-v1', 'AWS_REGION': 'us-east-2',
                'AWS_ACCESS_KEY_ID': 'AKIAEXAMPLEEXAMPLE00', 'AWS_SECRET_ACCESS_KEY': 'x' * 40}
        with mock.patch.dict(os.environ, fake):
            model = make_bedrock_model()
        self.assertEqual((type(model).__name__, model.model_id, model.temperature), ('ChatBedrockConverse', 'example.model-v1', 0.0))
        bound = model.bind_tools(build_clinical_calc_tools())
        names = [spec['function']['name'] for spec in bound.kwargs['tools']]
        self.assertEqual(names, ['calculate_voxel_volume', 'evaluate_fixation_safety', 'evaluate_implant_fit_metrics'])

    def test_bedrock_reasoning_blocks_reach_the_thinking_trace(self):
        from langchain_core.messages import AIMessage
        message = AIMessage(content=[{'type': 'reasoning_content', 'reasoning_content': {'text': 'check spacing'}},
                                     {'type': 'text', 'text': 'answer'}])
        self.assertEqual(reasoning_text(message), 'check spacing')


if __name__ == '__main__':
    unittest.main()


class RouteReadinessTest(unittest.TestCase):
    def test_not_ready_provider_returns_503_without_calling_the_model(self):
        import tempfile
        from pathlib import Path
        from fastapi.testclient import TestClient
        from skullfix_ai.agent.gemini_graph import GeminiChatAgent
        from skullfix_ai.api.app import create_app
        calls = []
        agent = GeminiChatAgent(lambda: calls.append('model') or None,
                                readiness=lambda: (False, 'AWS credentials were not found.'), mode='bedrock-read-only')
        with tempfile.TemporaryDirectory() as root, TestClient(create_app(Path(root), chat_agent=agent)) as client:
            body = {'request_id': 'r', 'conversation_id': 'c', 'project_id': 'p', 'case_id': 'k', 'object_id': 'o', 'message': 'hi'}
            for path in ('/api/ai/chat', '/api/ai/chat/stream'):
                response = client.post(path, json=body)
                self.assertEqual(response.status_code, 503, path)
                self.assertEqual(response.json()['code'], 'chat-provider-not-ready')
                self.assertIn('credentials', response.json()['reason'])
        self.assertEqual(calls, [])
