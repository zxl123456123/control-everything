"""Private fixed-route credentials for persistent automation ingress."""
import hashlib
import hmac
import json
import re
from types import MappingProxyType

from .identity import HubError


def _text(value):
    return isinstance(value, str) and 1 <= len(value) <= 256 and all(ord(c) >= 32 for c in value)


PLAN_CHOICE_FIELDS = {'namespace', 'task_id', 'flow_id', 'requirement_revision', 'decision_id', 'choice_id'}


def valid_plan_choice(value):
    return (type(value) is dict and set(value) == PLAN_CHOICE_FIELDS
            and value['namespace'] == 'control-everything.automation.v1'
            and all(_text(value[key]) for key in PLAN_CHOICE_FIELDS - {'requirement_revision'})
            and type(value['requirement_revision']) is int and value['requirement_revision'] >= 0)


class AutomationProducers:
    def __init__(self, configs):
        fields = {'producer_id', 'token_sha256', 'channel_account_id', 'app_id', 'chat_id',
                  'device_id', 'generation', 'project_id'}
        if not isinstance(configs, (list, tuple)):
            raise ValueError('invalid_automation_producers')
        producers, hashes = {}, set()
        for config in configs:
            if (type(config) is not dict or set(config) != fields
                    or any(not _text(config[k]) for k in fields - {'generation', 'token_sha256'})
                    or type(config['generation']) is not int or config['generation'] < 1
                    or not isinstance(config['token_sha256'], str)
                    or not re.fullmatch('[0-9a-f]{64}', config['token_sha256'])
                    or config['producer_id'] in producers or config['token_sha256'] in hashes):
                raise ValueError('invalid_automation_producers')
            producers[config['producer_id']] = MappingProxyType(dict(config))
            hashes.add(config['token_sha256'])
        self._producers = MappingProxyType(producers)

    def for_device(self, device_id, generation):
        return [dict(config) for config in self._producers.values()
                if config['device_id'] == device_id and config['generation'] == generation]

    def identity_contexts(self, device_id, generation):
        fields = ('producer_id', 'channel_account_id', 'app_id', 'chat_id',
                  'project_id', 'device_id', 'generation')
        return [{key: config[key] for key in fields} for config in self._producers.values()
                if config['device_id'] == device_id and config['generation'] == generation]

    def configuration(self, producer_id):
        config = self._producers.get(producer_id)
        if config is None:
            raise HubError('producer_unavailable', 409)
        return dict(config)

    def authenticate(self, producer_id, token):
        config = self._producers.get(producer_id)
        digest = hashlib.sha256(token.encode('utf-8')).hexdigest()
        matches = hmac.compare_digest(digest, config['token_sha256'] if config else '0' * 64)
        if config is None or not matches:
            raise HubError('invalid_producer_token', 401)
        return dict(config)

    def receive(self, mailbox, token, body):
        fields = {'producer_id', 'event_id', 'chat_id', 'message_id', 'actor_open_id'}
        actions = ('decision', 'binding', 'plan_release', 'assignment', 'new_task', 'plan_choice')
        if (type(body) is not dict or not any(set(body) == fields | {action} for action in actions)
                or not _text(body['producer_id'])):
            raise HubError('invalid_request_fields', 400)
        config = self._producers.get(body['producer_id'])
        digest = hashlib.sha256(token.encode('utf-8')).hexdigest()
        matches = hmac.compare_digest(digest, config['token_sha256'] if config else '0' * 64)
        if config is None or not matches:
            raise HubError('invalid_producer_token', 401)
        if any(not _text(body[k]) for k in fields):
            raise HubError('invalid_request_fields', 400)
        if body['chat_id'] != config['chat_id']:
            raise HubError('producer_chat_forbidden', 403)
        if 'new_task' in body:
            assignment = body['new_task']
            if (type(assignment) is not dict or set(assignment) != {'namespace', 'text'}
                    or assignment['namespace'] != 'control-everything.automation.v1'
                    or type(assignment['text']) is not str or not 1 <= len(assignment['text']) <= 4000
                    or not assignment['text'].strip() or '\x00' in assignment['text']
                    or body['event_id'] != body['message_id']):
                raise HubError('invalid_producer_decision', 400)
        elif 'plan_choice' in body:
            if not valid_plan_choice(body['plan_choice']):
                raise HubError('invalid_producer_decision', 400)
        elif 'plan_release' in body:
            release = body['plan_release']
            if (type(release) is not dict or set(release) != {'namespace', 'flow_id', 'text', 'requirement_revision'}
                    or release['namespace'] != 'control-everything.automation.v1'
                    or not _text(release['flow_id']) or release['text'] != '按已审方案实现'
                    or type(release['requirement_revision']) is not int or release['requirement_revision'] < 0):
                raise HubError('invalid_producer_decision', 400)
        elif 'assignment' in body:
            assignment = body['assignment']
            if (type(assignment) is not dict or set(assignment) != {'namespace', 'task_id', 'text'}
                    or assignment['namespace'] != 'control-everything.automation.v1'
                    or not _text(assignment['task_id']) or assignment['text'] != '请做这个任务'):
                raise HubError('invalid_producer_decision', 400)
        elif 'binding' in body:
            binding = body['binding']
            if (type(binding) is not dict or set(binding) != {'namespace', 'challenge_id', 'nonce'}
                    or any(not _text(value) for value in binding.values())
                    or binding['namespace'] != 'control-everything.identity.v1'):
                raise HubError('invalid_producer_binding', 400)
        else:
            decision = body['decision']
            decision_fields = {'namespace', 'decision_id', 'task_id', 'delivery_id', 'expected_revision',
                               'progress_revision', 'verdict'}
            if (type(decision) is not dict or set(decision) != decision_fields
                    or any(not _text(decision[k]) for k in decision_fields - {'expected_revision', 'progress_revision'})
                    or any(type(decision[k]) is not int or decision[k] < 0 for k in ('expected_revision', 'progress_revision'))
                    or decision['namespace'] != 'control-everything.automation.v1'
                    or decision['verdict'] not in ('approved', 'changes_requested', 'rejected')):
                raise HubError('invalid_producer_decision', 400)
        namespace = json.dumps([config['channel_account_id'], config['app_id']], ensure_ascii=True, separators=(',', ':'))
        source = 'feishu:' + hashlib.sha256(namespace.encode('utf-8')).hexdigest()
        payload = {k: config[k] for k in ('project_id', 'channel_account_id', 'app_id', 'chat_id')}
        payload.update(message_id=body['message_id'], actor_open_id=body['actor_open_id'])
        if 'binding' in body:
            payload.update(kind='feishu_identity_binding', producer_id=config['producer_id'],
                           binding=dict(binding))
        elif 'plan_release' in body:
            payload.update(kind='feishu_plan_release', producer_id=config['producer_id'],
                           plan_release=dict(release))
        elif 'assignment' in body:
            payload.update(kind='feishu_assignment', producer_id=config['producer_id'],
                           assignment=dict(assignment))
        elif 'new_task' in body:
            payload.update(kind='feishu_new_task', producer_id=config['producer_id'], assignment=dict(assignment))
        elif 'plan_choice' in body:
            payload.update(kind='feishu_plan_choice', producer_id=config['producer_id'],
                           plan_choice=dict(body['plan_choice']))
        else:
            payload.update(kind='feishu_card_decision', decision=dict(decision))
        return mailbox.receive(config['device_id'], config['generation'], source, body['event_id'], payload)
