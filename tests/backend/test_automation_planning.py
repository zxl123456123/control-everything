"""A plan/review result cannot substitute for required human product decisions."""

import copy
import json
import unittest

from control_everything.input_validation import ProfileError
from control_everything.workspace.native_progress import digest


class PlanningPolicyTests(unittest.TestCase):
    def setUp(self):
        from control_everything.workspace import automation_planning
        self.policy = automation_planning
        context = {'policy_version': 1, 'requirement_revision': 1, 'brief_revision': 0}
        self.plan = {'id': 'plan', 'flow_id': 'flow', 'kind': 'plan', 'status': 'completed',
            'request': {'context': context, 'plan_attempt': 0},
            'binding': {'agent': 'codex', 'providerSession': {'key': 'session_id', 'id': 'planner'}},
            'result': {'text': json.dumps({'kind': 'small', 'plan': 'Correct one boundary and run existing tests.',
                                         'needs_human': False, 'questions': []})}}
        self.review = {'id': 'review', 'flow_id': 'flow', 'kind': 'plan_review', 'status': 'completed',
            'request': {'context': copy.deepcopy(context), 'review_of': {
                'step_id': 'plan', 'text_sha256': digest(self.plan['result']['text'])}},
            'binding': {'agent': 'codex', 'providerSession': {'key': 'session_id', 'id': 'reviewer'}},
            'result': {'text': json.dumps({'kind': 'small', 'verdict': 'approve',
                                         'rationale': 'Scope and tests match.', 'questions': []})}}

    def plan_result(self, **changes):
        result = json.loads(self.plan['result']['text'])
        result.update(changes)
        self.plan['result']['text'] = json.dumps(result)
        self.review['request']['review_of']['text_sha256'] = digest(self.plan['result']['text'])

    def review_result(self, **changes):
        result = json.loads(self.review['result']['text'])
        result.update(changes)
        self.review['result']['text'] = json.dumps(result)

    def test_clear_small_change_can_continue_after_independent_review(self):
        result = self.policy.planning_outcome(self.plan, self.review)
        self.assertEqual(result['action'], 'implement')
        self.assertFalse(result['requires_code_review'])
        self.assertNotIn('accepted', result)

    def test_feature_permission_or_complex_change_requires_human_even_if_ai_approves(self):
        for kind in ('feature', 'permission', 'complex'):
            for side in ('plan', 'review'):
                with self.subTest(kind=kind, side=side):
                    self.plan_result(kind=kind if side == 'plan' else 'small')
                    self.review_result(kind=kind if side == 'review' else 'small')
                    result = self.policy.planning_outcome(self.plan, self.review)
                    self.assertEqual(result['action'], 'wait_for_user')
                    self.assertTrue(result['requires_code_review'])

    def test_explicit_questions_are_preserved_and_stop_dependent_implementation(self):
        self.plan_result(needs_human=True, questions=['Which retention period?'])
        self.review_result(verdict='discuss', questions=['Which retention period?', 'Who may export?'])
        result = self.policy.planning_outcome(self.plan, self.review)
        self.assertEqual(result['action'], 'wait_for_user')
        self.assertEqual(result['questions'], ['Which retention period?', 'Who may export?'])

    def test_technical_plan_revisions_are_limited_to_two(self):
        self.review_result(verdict='revise')
        for attempt in range(3):
            with self.subTest(attempt=attempt):
                self.plan['request']['plan_attempt'] = attempt
                result = self.policy.planning_outcome(self.plan, self.review)
                self.assertEqual(result['action'], 'revise_plan' if attempt < 2 else 'wait_for_user')
                if attempt < 2:
                    self.assertEqual(result['next_attempt'], attempt + 1)
                else:
                    self.assertEqual(result['reason'], 'plan_revision_limit')

    def test_review_must_name_the_exact_plan_and_request_version(self):
        for mutate in (lambda: self.review.update(flow_id='other'),
                       lambda: self.review['request']['review_of'].update(step_id='another-plan'),
                       lambda: self.review['request']['context'].update(brief_revision=2),
                       lambda: self.plan['result'].update(text=self.plan['result']['text'] + ' ')):
            with self.subTest(mutation=mutate):
                original = copy.deepcopy((self.plan, self.review))
                mutate()
                with self.assertRaisesRegex(ProfileError, 'automation_plan_changed'):
                    self.policy.planning_outcome(self.plan, self.review)
                self.plan, self.review = original

    def test_same_provider_session_cannot_review_itself(self):
        self.review['binding']['providerSession']['id'] = 'planner'
        with self.assertRaisesRegex(ProfileError, 'independent_review_required'):
            self.policy.planning_outcome(self.plan, self.review)

    def test_invalid_model_output_or_forged_approval_cannot_advance(self):
        original = copy.deepcopy(self.plan)
        for text in ('not JSON', '{}', '[]', json.dumps({'kind': 'small', 'plan': 'x',
            'needs_human': 'false', 'questions': []}), json.dumps({'kind': 'small', 'plan': 'x',
            'needs_human': False, 'questions': [], 'approved_by_user': True})):
            with self.subTest(text=text):
                self.plan = copy.deepcopy(original)
                self.plan['result']['text'] = text
                with self.assertRaisesRegex(ProfileError, 'invalid_planning_result'):
                    self.policy.read_plan(self.plan)

    def test_non_small_technical_revision_still_has_budget(self):
        for kind in ('feature', 'permission', 'complex'):
            self.plan_result(kind=kind)
            self.review_result(verdict='revise')
            self.assertEqual(self.policy.planning_outcome(self.plan, self.review)['action'], 'revise_plan')

    def test_explicit_human_choice_precedes_revision(self):
        self.review_result(verdict='revise', questions=['Choose a scope'])
        self.assertEqual(self.policy.planning_outcome(self.plan, self.review)['action'], 'wait_for_user')
        self.review_result(verdict='approve', questions=[])
        self.plan_result(needs_human=True)
        self.assertEqual(self.policy.planning_outcome(self.plan, self.review)['action'], 'wait_for_user')

    def test_invalid_budget_cannot_reset_revision_count(self):
        for attempt in (-1, True, '0', None):
            self.plan['request']['plan_attempt'] = attempt
            with self.assertRaisesRegex(ProfileError, 'invalid_planning_result'):
                self.policy.planning_outcome(self.plan, self.review)
        self.plan['request']['plan_attempt'] = 9
        self.review_result(verdict='revise')
        self.assertEqual(self.policy.planning_outcome(self.plan, self.review)['reason'], 'plan_revision_limit')

    def test_required_versions_must_exist_and_match(self):
        for key in ('requirement_revision', 'brief_revision', 'policy_version'):
            original = copy.deepcopy((self.plan, self.review))
            self.review['request']['context'][key] = 99
            with self.assertRaisesRegex(ProfileError, 'automation_plan_changed'):
                self.policy.planning_outcome(self.plan, self.review)
            del self.plan['request']['context'][key]
            del self.review['request']['context'][key]
            with self.assertRaisesRegex(ProfileError, 'automation_plan_changed'):
                self.policy.planning_outcome(self.plan, self.review)
            self.plan, self.review = original

    def test_review_record_and_json_boundaries(self):
        for change in ({'status': 'running'}, {'kind': 'implement'},
                       {'result': {'text': 'not JSON'}},
                       {'result': {'text': json.dumps({'kind': 'small', 'verdict': 'approve',
                         'rationale': 'ok', 'questions': [], 'approved_by_user': True})}}):
            original = copy.deepcopy(self.review)
            self.review.update(change)
            with self.assertRaisesRegex(ProfileError, 'invalid_planning_result'):
                self.policy.planning_outcome(self.plan, self.review)
            self.review = original
        self.review['binding']['providerSession'].pop('id')
        with self.assertRaisesRegex(ProfileError, 'independent_review_required'):
            self.policy.planning_outcome(self.plan, self.review)
