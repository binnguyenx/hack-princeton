"""ProposalStore.accept commits outside the store lock and records the outcome (PR #38 review)."""
import threading
import unittest

from skullfix_ai.agent.staging import ProposalStore, StagingError
from skullfix_ai.application.model_reconstruction import ReconstructionError
from skullfix_ai.schemas.workspace import AppObjectContext


def context(candidate='cand', revision='rev-1'):
    return AppObjectContext.model_construct(project_id='p', case_id='c', sample_id='s', candidate_id=candidate,
                                            revision_id=revision)


class BlockingFixService:
    """adjust() waits until released, so the test can act while a commit is in flight."""

    def __init__(self, error=None):
        self.entered, self.release, self.error = threading.Event(), threading.Event(), error

    def adjust(self, candidate_id, command):
        self.entered.set()
        self.release.wait(5)
        if self.error:
            raise self.error
        return {'revisionId': 'rev-2'}


class ProposalStoreAcceptTest(unittest.TestCase):
    def stage(self, store, **kw):
        return store.stage(context(**kw), conversation_id='conv', kind='model_fix', summary='tighten',
                           payload={'action': 'threshold', 'threshold': 0.7})

    def accept_in_thread(self, store, proposal, service):
        outcome = {}

        def run():
            try:
                outcome['proposal'] = store.accept(proposal.proposal_id, None, project_id='p', case_id='c',
                                                   candidate_id='cand', base_revision_id='rev-1', fix_service=service)
            except StagingError as error:
                outcome['error'] = error
        thread = threading.Thread(target=run)
        thread.start()
        self.assertTrue(service.entered.wait(5))
        return thread, outcome

    def test_slow_commit_does_not_block_other_store_operations(self):
        store, service = ProposalStore(), BlockingFixService()
        proposal = self.stage(store)
        thread, outcome = self.accept_in_thread(store, proposal, service)
        # These would deadlock-wait on the lock if accept held it during adjust().
        other = self.stage(store)
        self.assertEqual(store.discard(other.proposal_id).status, 'discarded')
        self.assertEqual(store.get(proposal.proposal_id).status, 'pending')
        with self.assertRaises(StagingError) as busy:
            store.discard(proposal.proposal_id)
        self.assertEqual(busy.exception.code, 'proposal-accepting')
        with self.assertRaises(StagingError) as twice:
            store.accept(proposal.proposal_id, None, project_id='p', case_id='c', candidate_id='cand',
                         base_revision_id='rev-1', fix_service=service)
        self.assertEqual(twice.exception.code, 'proposal-accepting')
        service.release.set()
        thread.join(5)
        self.assertEqual((outcome['proposal'].status, outcome['proposal'].resolved_revision_id), ('accepted', 'rev-2'))
        self.assertEqual(store.get(proposal.proposal_id).status, 'accepted')

    def test_changed_revision_marks_proposal_stale_and_releases_claim(self):
        store = ProposalStore()
        service = BlockingFixService(ReconstructionError('revision-changed', 'changed', 409))
        proposal = self.stage(store)
        thread, outcome = self.accept_in_thread(store, proposal, service)
        service.release.set()
        thread.join(5)
        self.assertEqual(outcome['error'].code, 'revision-changed')
        self.assertEqual(store.get(proposal.proposal_id).status, 'stale')

    def test_unexpected_failure_is_coded_and_proposal_stays_pending(self):
        store, service = ProposalStore(), BlockingFixService(FileNotFoundError('model card'))
        proposal = self.stage(store)
        thread, outcome = self.accept_in_thread(store, proposal, service)
        service.release.set()
        thread.join(5)
        self.assertEqual((outcome['error'].code, outcome['error'].status), ('proposal-apply-failed', 500))
        self.assertEqual(store.get(proposal.proposal_id).status, 'pending')


if __name__ == '__main__':
    unittest.main()
