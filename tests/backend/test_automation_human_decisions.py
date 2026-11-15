"""Trusted human replies become decisions; vague or model text does not."""
import unittest

from control_everything.workspace.automation_human_decisions import classify_decision


def message(**changes):
    value = {'source': 'human', 'quoted': False, 'actor_id': 'owner', 'text': '按 A 做',
             'requirement_revision': 1}
    value.update(changes)
    return value


def task(**changes):
    value = {'id': 'task-1', 'open': True, 'requirement_revision': 1, 'question_id': 'q1',
             'choices': ['A'], 'delivery_id': 'delivery-1'}
    value.update(changes)
    return value


class HumanDecisionTests(unittest.TestCase):
    def test_explicit_choice_and_acceptance_execute_once_each(self):
        choice = classify_decision(message(), tasks=[task()])
        self.assertEqual(choice['action'], 'execute')
        self.assertEqual(choice['choice'], 'A')
        accepted = classify_decision(message(text='这个版本通过，集成 develop'), tasks=[task()])
        self.assertEqual(accepted['verdict'], 'approved')
        self.assertEqual(accepted['delivery_id'], 'delivery-1')

    def test_vague_quoted_model_and_stale_replies_do_not_execute(self):
        current = [task()]
        for sample in (
                message(text='不错'),
                message(text='可以考虑以后再做'),
                message(text='要不要做？'),
                message(quoted=True),
                message(source='model'),
                message(requirement_revision=0)):
            with self.subTest(sample=sample):
                self.assertNotEqual(classify_decision(sample, tasks=current)['action'], 'execute')

    def test_two_open_tasks_ask_instead_of_guessing(self):
        result = classify_decision(message(text='这个版本通过，集成 develop'), tasks=[task(), task(id='task-2')])
        self.assertEqual(result, {'action': 'ask', 'reason': 'task_ambiguous'})
