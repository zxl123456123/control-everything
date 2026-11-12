"""Send plain text with the existing app identity and a persistent delivery UUID."""
import json
import re
import time
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NotSent(Exception):
    """The message creation request has definitely not started."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        raise ValueError('feishu_redirect_refused')


def request(path, payload, token):
    headers = {'Content-Type': 'application/json; charset=utf-8'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    item = Request('https://open.feishu.cn/open-apis/' + path,
                   data=json.dumps(payload, ensure_ascii=False).encode(), headers=headers, method='POST')
    with build_opener(NoRedirect()).open(item, timeout=30) as response:
        return json.load(response)


class FeishuSender:
    def __init__(self, app_id, app_secret, group, *, request=request):
        if not re.fullmatch(r'oc_[A-Za-z0-9]+', group):
            raise ValueError('fixed_group_required')
        self.app_id, self.app_secret, self.group = app_id, app_secret, group
        self.request, self.token = request, None

    def __call__(self, body, delivery_uuid, *, deadline=None):
        if not self.token:
            try:
                result = self.request('auth/v3/tenant_access_token/internal',
                                      {'app_id': self.app_id, 'app_secret': self.app_secret}, None)
                if result.get('code') != 0 or not result.get('tenant_access_token'):
                    raise ValueError('tenant_token_unavailable')
                self.token = result['tenant_access_token']
            except (OSError, ValueError, KeyError, TypeError) as error:
                raise NotSent('tenant_token_unavailable') from error
        if deadline is not None and time.time() >= deadline:
            raise NotSent('delivery_window_expired')
        result = self.request('im/v1/messages?receive_id_type=chat_id',
                              {'receive_id': self.group, 'msg_type': 'text', 'uuid': delivery_uuid,
                               'content': json.dumps({'text': body}, ensure_ascii=False)}, self.token)
        if result.get('code') != 0:
            # An error following a POST is not proof that the server never accepted the UUID.
            raise ValueError('feishu_send_unconfirmed')
        receipt = result['data']
        if receipt.get('chat_id') != self.group:
            raise ValueError('message_route_mismatch')
        return receipt['message_id']
