"""Execute persisted native operations without turning intermediate replies into deliveries."""

from control_everything.input_validation import ProfileError
from control_everything.workspace.native_progress import packed, trusted_snapshot

READ_ONLY_REFUSALS = ('read_only_launch_args_unsupported', 'read_only_command_override_unsupported')

class AutomationLaunch:
    def __init__(self, queue, adapter):
        self.queue, self.adapter = queue, adapter

    def _unknown(self, lease, step, reason):
        if step['status'] == 'unknown':
            return step
        return self.queue.record(lease, step, 'unknown', result={'reason': reason})

    def prepare(self, lease, step, *, cancel_event=None):
        if (step['status'] == 'completed' or not self.adapter.available
                or cancel_event is not None and cancel_event.is_set()):
            return step
        self.queue.renew(lease)
        if step['status'] == 'reserved':
            step = self.queue.record(lease, step, 'dispatching')
        try:
            payload = step['request']['input']
            scope = self.adapter.prepare_scope(payload['directory']['path'], payload['request']['worktree_id'],
                                               cancel_event=cancel_event)
        except ProfileError:
            raise
        except Exception:
            return self._unknown(lease, step, 'scope_unavailable')
        return self.queue.record(lease, step, 'completed', result={'scope': scope})

    def run(self, lease, step, *, cancel_event=None):
        if (step['status'] in ('completed', 'failed', 'cancelled', 'cancelling') or not self.adapter.available
                or cancel_event is not None and cancel_event.is_set()):
            return step
        self.queue.renew(lease)
        if step['binding']:
            return self._observe(lease, step, cancel_event)
        if step['status'] == 'reserved':
            step = self.queue.record(lease, step, 'dispatching')
        params = {**step['request']['params'], 'operationId': step['operation_id']}
        try:
            # The native create operation first replays/reconciles this exact ID and request.
            # Its pinned runtime identity prevents a fresh runtime from reissuing a lost start.
            reply = self.adapter.create(params, cancel_event=cancel_event)
        except ProfileError:
            raise
        except Exception:
            return self._unknown(lease, step, 'launch_unavailable')
        if (params.get('readOnly') is True and reply.get('contractVersion') == 1
                and reply.get('refused') is True and reply.get('reason') in READ_ONLY_REFUSALS):
            return self.queue.record(lease, step, 'failed', result={'reason': reply['reason']})
        binding = reply.get('binding') or {}
        if (reply.get('contractVersion') != 1
                or any(binding.get(key) != params[key] for key in ('runtimeId', 'environmentId', 'worktreeId', 'agent'))
                or any(binding.get(key) is None for key in ('terminalHandle', 'paneKey', 'ptyId',
                    'processIncarnation', 'statusProcessIncarnation', 'generation'))):
            return self._unknown(lease, step, 'binding_changed')
        return self.queue.record(lease, step, 'running', binding=binding, result={})

    def _observe(self, lease, step, cancel_event):
        try:
            facts = self.adapter.observe(step['binding'], timeout=.75, cancel_event=cancel_event)
        except ProfileError:
            raise
        except Exception:
            return self._unknown(lease, step, 'observation_unavailable')
        if not trusted_snapshot({'terminal_binding_json': packed(step['binding'])}, facts):
            return step
        status = facts['status']
        text = status.get('lastAssistantMessage')
        started, ended = status.get('turnStartedAt'), status.get('turnEndedAt')
        if (status.get('state') != 'done' or status.get('turnEndDisposition') != 'identified'
                or any(status.get(key) for key in ('interrupted', 'isReplay', 'sessionBoundary',
                                                   'restoredUnconfirmed', 'lastAssistantMessageIsToolOutput'))
                or started is None or ended is None or ended < started or not isinstance(text, str) or not text.strip()):
            return step
        return self.queue.record(lease, step, 'completed', binding=facts['binding'], result={'text': text, 'facts': facts})
