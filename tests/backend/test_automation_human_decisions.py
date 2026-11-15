"""Trusted human replies become decisions; vague or model text does not."""
import unittest

from control_everything.workspace.automation_human_decisions import classify_decision, question_card, reply_from_card, waiting_card


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

    def test_uncertain_step_sends_one_choice_card_and_only_that_reply_continues(self):
        waiting = {'task_id': 'tank', 'title': '坦克游戏', 'questions': ['操作方式用哪一种？'],
                   'choices': ['键盘', '触屏'], 'requirement_revision': 1}
        card = question_card(waiting)
        buttons = [item for item in card['body']['elements'] if item['tag'] == 'button']
        self.assertEqual([item['value']['choice'] for item in buttons], ['键盘', '触屏'])
        chosen = reply_from_card(buttons[0]['value'], waiting)
        self.assertEqual(chosen['choice'], '键盘')
        stale = dict(buttons[0]['value'], requirement_revision=0)
        self.assertEqual(reply_from_card(stale, waiting)['action'], 'reject')
        with self.assertRaises(ValueError):
            question_card({**waiting, 'questions': ['甲？', '乙？']})

    def test_waiting_feature_plan_card_releases_only_the_same_flow(self):
        flow = {'id': 'flow-1', 'status': 'waiting_user', 'task_id': 'task-1',
                'context': {'input': {'brief': {'task_id': 'task-1'}}},
                'attention': {'requires_code_review': True, 'questions': [],
                              'versions': {'requirement_revision': 3}}}
        card = waiting_card(flow)
        value = card['body']['elements'][1]['value']
        self.assertEqual(value['choice'], '按已审方案实现')
        self.assertEqual(value['flow_id'], 'flow-1')
        self.assertEqual(reply_from_card(value, {'task_id': 'task-1', 'requirement_revision': 3,
                                                 'choices': ['按已审方案实现']})['action'], 'execute')
        self.assertEqual(reply_from_card(dict(value, flow_id='other'), {
            'task_id': 'task-1', 'flow_id': 'flow-1', 'requirement_revision': 3,
            'choices': ['按已审方案实现']})['action'], 'reject')

    def test_two_open_tasks_ask_instead_of_guessing(self):
        result = classify_decision(message(text='这个版本通过，集成 develop'), tasks=[task(), task(id='task-2')])
        self.assertEqual(result, {'action': 'ask', 'reason': 'task_ambiguous'})
