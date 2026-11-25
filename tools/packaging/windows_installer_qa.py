"""Download fixed repository assets before a credential-free Windows QA process."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError

REPOSITORY = 'zxl123456123/control-everything'
VERIFIER_COMMIT = 'a68b9508121312ff280ce45a635032cf3b0f94a4'
VERIFIER_SHA256 = '15652c65b3a4a8fb89243cbc7eab291bb3ee369169063501373e1f090a8b9720'


class AssetRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, url):
        # Release redirects are signed; the repository token must stay at api.github.com.
        result = super().redirect_request(request, response, code, message, headers, url)
        if result:
            result.remove_header('Authorization')
        return result


def require(value, reason):
    if not value:
        raise ValueError(reason)


def read_api(path, token):
    headers = {'User-Agent': 'session-panel-installer-qa', 'Accept': 'application/vnd.github+json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    with build_opener(AssetRedirect()).open(Request('https://api.github.com/repos/' + REPOSITORY + path,
                                                   headers=headers), timeout=60) as response:
        return json.load(response)


def validate_request(value):
    if value == {'mode': 'smoke'}:
        return value
    require(set(value) == {'candidate', 'baseline'}, 'request_fields')
    for item in value.values():
        require(set(item) == {'release_id', 'version', 'source_commit', 'draft', 'installer', 'product'}, 'product_fields')
        require(type(item['release_id']) is int and item['release_id'] > 0, 'release_id')
        require(re.fullmatch(r'0\.1\.0a[0-9]+', item['version']) is not None, 'version')
        require(re.fullmatch(r'[0-9a-f]{40}', item['source_commit']) is not None, 'source_commit')
        require(type(item['draft']) is bool, 'draft')
        for asset in (item['installer'], item['product']):
            require(set(asset) == {'id', 'sha256'} and type(asset['id']) is int and asset['id'] > 0, 'asset_id')
            require(re.fullmatch(r'[0-9a-f]{64}', asset['sha256']) is not None, 'asset_hash')
    require(value['candidate']['version'] != value['baseline']['version'], 'different_versions_required')
    require(value['baseline']['draft'] is False, 'public_baseline_required')
    return value


def download(url, destination, digest, token=None):
    headers = {'User-Agent': 'session-panel-installer-qa', 'Accept': 'application/octet-stream'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    with build_opener(AssetRedirect()).open(Request(url, headers=headers), timeout=120) as response:
        with destination.open('xb') as output:
            shutil.copyfileobj(response, output)
    require(hashlib.sha256(destination.read_bytes()).hexdigest() == digest, 'download_hash')


def prepare(root, request, token):
    root.mkdir(parents=True, exist_ok=False)
    if request != {'mode': 'smoke'}:
        for label, item in request.items():
            release = read_api('/releases/' + str(item['release_id']), token)
            require(release['draft'] is item['draft'], 'release_visibility')
            require(item['draft'] or release['tag_name'] == 'v' + item['version'], 'release_version')
            assets = {asset['id']: asset for asset in release['assets']}
            destination = root / label
            destination.mkdir()
            for key, name in [('installer', 'session-panel-' + item['version'] + '-windows-x64.exe'), ('product', 'product.json')]:
                asset = assets[item[key]['id']]
                require(asset['name'] == name and asset['state'] == 'uploaded', 'asset_identity')
                require(asset['digest'] == 'sha256:' + item[key]['sha256'], 'asset_digest')
                download('https://api.github.com/repos/' + REPOSITORY + '/releases/assets/' + str(asset['id']),
                         destination / ('installer.exe' if key == 'installer' else name), item[key]['sha256'], token)
            product = json.loads((destination / 'product.json').read_text(encoding='utf-8'))
            require(product['product'] == 'session-panel' and product['version'] == item['version']
                    and product['source']['commit'] == item['source_commit']
                    and product['source']['dirty'] is False, 'product_identity')
    download('https://raw.githubusercontent.com/' + REPOSITORY + '/' + VERIFIER_COMMIT + '/tests/e2e/verify_installed_product.py',
             root / 'verifier.py', VERIFIER_SHA256)
    (root / 'request.json').write_text(json.dumps(request), encoding='utf-8')


if __name__ == '__main__':
    try:
        prepare(Path(sys.argv[1]), validate_request(json.loads(os.environ['QA_REQUEST'])), os.environ.get('GH_TOKEN'))
        print('QA inputs verified')
    except Exception as error:
        # Redirect URLs and private release metadata never enter public workflow logs.
        detail = type(error).__name__ + (':' + str(error.code) if isinstance(error, HTTPError) else '')
        print('QA input preparation failed: ' + detail, file=sys.stderr)
        sys.exit(1)
