"""Provider chat uses synthetic disposable metadata and never real credentials."""
import json
import os
from unittest.mock import patch
import unittest
import test_chat_context as chat_cases


class GeminiChatTest(unittest.TestCase):
    setUp = chat_cases.ChatContextTest.setUp

    def test_gemini_history_tool_and_explanation_preserve_storage(self):
        from skullfix_ai.agent.gemini import GeminiModel
        replies = [dict(name='workspace.describe_selection', arguments={}),
                   dict(reply='We can inspect the selected skull metadata. Which aspect interests you?',
                        facts=['selected_object_id'], kind='clarification')]
        before = self.repo.read_project_manifest(self.project['id'])
        captured = []
        def transport(model, key, body, timeout):
            captured.append(body)
            return replies.pop(0)
        with patch.dict(os.environ, {'SKULLFIX_AI_CHAT_MODEL':'gemini','GEMINI_API_KEY':'synthetic-test-key',
                                     'SKULLFIX_AI_GEMINI_MODEL':'gemini-test'}), patch.object(GeminiModel, '_generate', side_effect=transport):
            response = self.client.post('/api/ai/chat', json={**self.payload,'message':'continue',
                'history':[{'role':'human','content':'Inspect the skull'}]})
        self.assertEqual(response.status_code,200,response.text)
        body = response.json()
        self.assertEqual(body['mode'],'llm-read-only')
        self.assertEqual(body['model'],{'provider':'gemini','id':'gemini-test'})
        self.assertEqual(body['capability_policy'],'metadata-read-only')
        self.assertEqual(body['outcome']['status'],'completed',body)
        self.assertIn('Which aspect interests you?',body['outcome']['explanation'])
        self.assertIn(self.payload['object_id'],body['outcome']['explanation'])
        self.assertEqual(len(captured),2)
        self.assertIn('Inspect the skull',json.dumps(captured))
        self.assertNotIn('synthetic-test-key',json.dumps(captured))
        proposal_schema = captured[0]['generationConfig']['responseJsonSchema']
        self.assertEqual(proposal_schema['properties']['name']['enum'],['workspace.describe_selection'])
        self.assertEqual(proposal_schema['properties']['arguments']['properties']['include_pose']['type'],'boolean')
        self.assertNotIn('JsonValue',json.dumps(proposal_schema))
        self.assertEqual(self.repo.read_project_manifest(self.project['id']),before)

    def configured(self):
        return patch.dict(os.environ, {'SKULLFIX_AI_CHAT_MODEL':'gemini','GEMINI_API_KEY':'synthetic-test-key',
                                      'SKULLFIX_AI_GEMINI_MODEL':'gemini-test'})

    def test_missing_configuration_does_not_fall_back_or_expose_key(self):
        with patch.dict(os.environ, {'SKULLFIX_AI_CHAT_MODEL':'gemini','GEMINI_API_KEY':'', 'SKULLFIX_AI_GEMINI_MODEL':''}):
            response = self.client.post('/api/ai/chat',json=self.payload)
        self.assertEqual(response.status_code,503)
        self.assertEqual(response.json()['code'],'model-config-invalid')
        with patch.dict(os.environ, {'SKULLFIX_AI_CHAT_MODEL':'unknown'}):
            response = self.client.post('/api/ai/chat',json=self.payload)
        self.assertEqual(response.status_code,503)

    def test_unknown_tool_arguments_and_fabricated_explanation_fail_without_writes(self):
        from skullfix_ai.agent.gemini import GeminiModel
        import hashlib
        def hashes():
            return {str(p.relative_to(self.repo.root)):hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in self.repo.root.rglob('*') if p.is_file()}
        before = hashes()
        scenarios = [([{'name':'workspace.place','arguments':{}}],'tool-unsupported'),
                     ([{'name':'workspace.describe_selection','arguments':{'include_pose':'yes'}}],'tool-arguments-invalid'),
                     ([{'name':'workspace.describe_selection','arguments':{}},
                       {'reply':'The defect measures 12.4 cm','facts':[],'kind':'answer'}],'model-output-ungrounded'),
                     ([{'name':'workspace.describe_selection','arguments':{}},
                       {'reply':'Here is the measurement.','facts':['defect_area'],'kind':'answer'}],'model-output-ungrounded')]
        for replies, code in scenarios:
            with self.subTest(code=code), self.configured(), patch.object(GeminiModel,'_generate',side_effect=replies) as transport:
                response = self.client.post('/api/ai/chat',json=self.payload)
                self.assertEqual(response.json()['outcome']['code'],code,response.text)
                self.assertEqual(transport.call_count,len(replies))
            self.assertEqual(hashes(),before)

    def test_provider_failures_are_safe_typed_and_never_retried(self):
        from skullfix_ai.agent.gemini import GeminiModel
        from urllib.error import HTTPError, URLError
        import io
        for error, code in [(HTTPError('https://provider.invalid',status,'sensitive synthetic-test-key',{},io.BytesIO(b'sensitive body')),code)
                            for status,code in [(401,'model-auth-failed'),(403,'model-auth-failed'),(404,'model-unavailable'),
                                                (429,'model-rate-limited'),(503,'model-unavailable')]] + [
                            (TimeoutError('synthetic-test-key'),'model-timeout'),
                            (URLError('synthetic-test-key'),'model-unavailable')]:
            with self.subTest(code=code), self.configured(), patch('skullfix_ai.agent.gemini.build_opener') as opener:
                opener.return_value.open.side_effect = error
                response = self.client.post('/api/ai/chat',json=self.payload)
                self.assertEqual(response.json()['outcome']['code'],code,response.text)
                self.assertNotIn('synthetic-test-key',response.text)
                self.assertNotIn('sensitive body',response.text)
                self.assertEqual(opener.return_value.open.call_count,1)
                request = opener.return_value.open.call_args.args[0]
                self.assertNotIn('synthetic-test-key',request.full_url)
                self.assertEqual(request.get_header('X-goog-api-key'),'synthetic-test-key')
                self.assertEqual(opener.return_value.open.call_args.kwargs['timeout'],10)

    def test_provider_wire_decodes_only_complete_bounded_json(self):
        from skullfix_ai.agent.gemini import GeminiModel, ProviderError
        good = {'candidates':[{'finishReason':'STOP','content':{'parts':[{'thought':True,'text':'private thought'},
                {'text':'{"name":"workspace.describe_selection","arguments":{}}'}]}}]}
        with patch('skullfix_ai.agent.gemini.build_opener') as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = json.dumps(good).encode()
            self.assertEqual(GeminiModel._generate('gemini-test','synthetic-test-key',{},10)['name'],'workspace.describe_selection')
        for raw in [b'x'*(1024*1024+1), b'not json', b'{}',
                    json.dumps({'candidates':[{'finishReason':'MAX_TOKENS'}]}).encode()]:
            with self.subTest(size=len(raw)), patch('skullfix_ai.agent.gemini.build_opener') as opener:
                opener.return_value.open.return_value.__enter__.return_value.read.return_value = raw
                with self.assertRaises(ProviderError) as error:
                    GeminiModel._generate('gemini-test','synthetic-test-key',{},10)
                self.assertEqual(error.exception.code,'model-output-invalid')

    def test_real_wire_shape_flows_through_graph_without_scripted_override(self):
        replies = [{'name':'workspace.describe_selection','arguments':{'include_pose':False}},
                   {'reply':'Let us continue exploring the stored skull metadata.','facts':['selected_object_id'],'kind':'answer'}]
        responses = [json.dumps({'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':json.dumps(reply)}]}}]}).encode()
                     for reply in replies]
        with self.configured(), patch('skullfix_ai.agent.gemini.build_opener') as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.side_effect = responses
            response = self.client.post('/api/ai/chat',json=self.payload)
            self.assertEqual(response.json()['outcome']['status'],'completed',response.text)
            self.assertIn('Let us continue',response.json()['outcome']['explanation'])
            self.assertEqual(opener.return_value.open.call_count,2)
            for call in opener.return_value.open.call_args_list:
                request = call.args[0]
                self.assertEqual(request.full_url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent')
                body = json.loads(request.data)
                self.assertEqual(body['generationConfig']['responseMimeType'],'application/json')
                self.assertNotIn('synthetic-test-key',request.data.decode())

    def test_stale_selection_stops_before_provider_and_restored_pointer_is_authoritative(self):
        from skullfix_ai.agent.gemini import GeminiModel
        candidate = self.repo.create_candidate(self.sample['id'])
        r0 = candidate['revisionId']
        self.repo.commit_transform(candidate['candidateId'],[1,0,0,5,0,1,0,0,0,0,1,0,0,0,0,1])
        payload = {**self.payload,'object_id':candidate['candidateId'],'expected_revision_id':r0}
        with self.configured(), patch.object(GeminiModel,'_generate') as provider:
            result = self.client.post('/api/ai/chat',json=payload).json()
            self.assertEqual(result['outcome']['code'],'stale-revision')
            provider.assert_not_called()
        # Restoration is a manual application operation, never an AI tool.
        self.repo.restore_revision(candidate['candidateId'], r0)
        with self.configured(), patch.object(GeminiModel,'_generate', side_effect=[
            {'name':'workspace.describe_selection','arguments':{}},
            {'reply':'The current revision is shown below.','facts':['revision_id'],'kind':'answer'}]):
            result = self.client.post('/api/ai/chat',json=payload).json()
        self.assertEqual(result['outcome']['status'],'completed',result)
        self.assertEqual(result['outcome']['context']['revision_id'],r0)


if __name__ == '__main__': unittest.main()
