"""Copy one verified existing attachment into an existing unpublished release."""
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import sys
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, Request, build_opener
import zipfile

from windows_installer_qa import AssetRedirect, REPOSITORY, read_api, require


def validate_request(value):
    fields = {'source_release_id', 'source_asset_id', 'target_release_id', 'target_tag',
              'target_commit', 'target_name', 'sha256', 'size'}
    require(type(value) is dict and set(value) == fields, 'request_fields')
    for key in ('source_release_id', 'source_asset_id', 'target_release_id', 'size'):
        require(type(value[key]) is int and value[key] > 0, key)
    require(value['source_release_id'] != value['target_release_id'], 'distinct_releases_required')
    require(re.fullmatch(r'[0-9a-f]{64}', value['sha256']) is not None, 'sha256')
    require(re.fullmatch(r'[0-9a-f]{40}', value['target_commit']) is not None, 'target_commit')
    tag = re.fullmatch(r'v(0\.1\.0a([0-9]+))', value['target_tag'])
    require(tag is not None, 'target_tag')
    require(value['target_name'] in {'session-panel-' + tag[1] + suffix
                                   for suffix in ('-windows-x64.exe', '-sources.zip')}, 'target_name')
    return value


def assets(release_id, token):
    rows = read_api('/releases/' + str(release_id) + '/assets?per_page=100', token)
    require(len(rows) < 100, 'asset_list_limit')
    require(len({row['name'] for row in rows}) == len(rows), 'duplicate_assets')
    return rows


def matches(row, request):
    return (row['state'] == 'uploaded' and row['size'] == request['size']
            and row.get('digest') == 'sha256:' + request['sha256'])


def check_target(request, token):
    target = read_api('/releases/' + str(request['target_release_id']), token)
    require(target['draft'] is True and target['tag_name'] == request['target_tag']
            and target['target_commitish'] == request['target_commit'], 'target_draft_identity')
    require(read_api('/commits/' + request['target_commit'], token)['sha'] == request['target_commit'], 'target_commit')
    try:
        obj = read_api('/git/ref/tags/' + quote(request['target_tag'], safe=''), token)['object']
    except HTTPError as error:
        if error.code != 404:
            raise
    else:
        for _ in range(4):
            if obj['type'] == 'commit':
                break
            require(obj['type'] == 'tag', 'tag_object')
            obj = read_api('/git/tags/' + obj['sha'], token)['object']
        require(obj['type'] == 'commit' and obj['sha'] == request['target_commit'], 'tag_commit')
    return next((row for row in assets(request['target_release_id'], token)
                 if row['name'] == request['target_name']), None)


def download(asset_id, destination, token):
    url = 'https://api.github.com/repos/' + REPOSITORY + '/releases/assets/' + str(asset_id)
    request = Request(url, headers={'Accept': 'application/octet-stream', 'User-Agent': 'release-asset-reuse',
                                    'Authorization': 'Bearer ' + token})
    with build_opener(AssetRedirect()).open(request, timeout=900) as response, destination.open('xb') as output:
        while block := response.read(1024 * 1024):
            output.write(block)


def check_file(path, request):
    require(path.stat().st_size == request['size'], 'download_size')
    with path.open('rb') as stream:
        require(hashlib.file_digest(stream, 'sha256').hexdigest() == request['sha256'], 'download_hash')
    if request['target_name'].endswith('.zip'):
        require(zipfile.is_zipfile(path), 'sources_zip_required')
    else:
        with path.open('rb') as stream:
            header = stream.read(64)
            require(len(header) == 64 and header[:2] == b'MZ', 'installer_pe_required')
            stream.seek(struct.unpack_from('<I', header, 60)[0])
            require(stream.read(4) == b'PE\0\0', 'installer_pe_required')


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def upload(path, request, token):
    url = ('https://uploads.github.com/repos/' + REPOSITORY + '/releases/'
           + str(request['target_release_id']) + '/assets?name=' + quote(request['target_name'], safe=''))
    with path.open('rb') as stream:
        message = Request(url, data=stream, method='POST', headers={
            'Authorization': 'Bearer ' + token, 'User-Agent': 'release-asset-reuse',
            'Content-Type': 'application/octet-stream', 'Content-Length': str(request['size'])})
        with build_opener(NoRedirect()).open(message, timeout=1800) as response:
            return json.load(response)


def copy_asset(request, directory, token):
    request = validate_request(request)
    source = read_api('/releases/' + str(request['source_release_id']), token)
    item = next(row for row in assets(request['source_release_id'], token) if row['id'] == request['source_asset_id'])
    require(matches(item, request), 'source_asset_identity')
    if request['target_name'].endswith('.exe'):
        require(source['draft'] is True and item['name'] == request['target_name'], 'same_candidate_installer_required')
    else:
        version = re.fullmatch(r'v0\.1\.0a([0-9]+)', source['tag_name'])
        require(source['draft'] is False and version is not None
                and int(version[1]) + 1 == int(request['target_tag'].split('a')[-1])
                and item['name'] == 'session-panel-' + source['tag_name'][1:] + '-sources.zip', 'previous_public_sources_required')
    existing = check_target(request, token)
    if existing:
        require(matches(existing, request), 'existing_asset_conflict')
        return {'status': 'already-present', 'asset_id': existing['id']}
    directory.mkdir(parents=True, exist_ok=False)
    file = directory / 'attachment'
    download(item['id'], file, token)
    check_file(file, request)
    # Recheck the exact draft after the long transfer, before the only write.
    existing = check_target(request, token)
    if existing:
        require(matches(existing, request), 'existing_asset_conflict')
        return {'status': 'already-present', 'asset_id': existing['id']}
    uploaded = upload(file, request, token)
    require(uploaded['name'] == request['target_name'] and matches(uploaded, request), 'uploaded_asset_identity')
    actual = check_target(request, token)
    require(actual and actual['id'] == uploaded['id'] and matches(actual, request), 'uploaded_asset_recheck')
    return {'status': 'copied', 'asset_id': actual['id']}


if __name__ == '__main__':
    try:
        result = copy_asset(json.loads(os.environ['REUSE_REQUEST']), Path(sys.argv[1]), os.environ['GH_TOKEN'])
        print(json.dumps(result))
    except Exception as error:
        print('Release attachment reuse failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
