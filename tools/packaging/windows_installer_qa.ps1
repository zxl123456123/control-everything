param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][string]$Python)
$ErrorActionPreference = 'Stop'
$name = 'CEQA_' + [Guid]::NewGuid().ToString('N').Substring(0,10)
$password = ConvertTo-SecureString ('Qa!' + [Guid]::NewGuid().ToString('N') + 'a9') -AsPlainText -Force
$report = @{status='failed'; exitCode=$null; accountRemoved=$false; errors=@()}
$account = $null
try {
    if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'Hosted runner required' }
    $account = New-LocalUser -Name $name -Password $password -AccountExpires (Get-Date).AddHours(2)
    Add-LocalGroupMember -SID 'S-1-5-32-545' -Member $account
    if (Get-LocalGroupMember -SID 'S-1-5-32-544' | Where-Object SID -eq $account.SID) { throw 'Standard user required' }
    $acl = Get-Acl -LiteralPath $Root
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($account.SID,'Modify','ContainerInherit,ObjectInherit','None','Allow'))
    Set-Acl -LiteralPath $Root -AclObject $acl
    $request = Get-Content (Join-Path $Root 'request.json') -Raw | ConvertFrom-Json
    $probe = Join-Path $Root 'identity.py'
    @'
import ctypes,json,os,pathlib,urllib.request
assert not ctypes.windll.shell32.IsUserAnAdmin(), 'administrator_token'
assert not any('TOKEN' in key or key.startswith(('GITHUB_', 'ACTIONS_', 'GH_')) for key in os.environ), 'credential_environment'
result={'standard_user':True,'credential_environment':False}
if not (pathlib.Path(__file__).parent/'candidate').is_dir():
    request=urllib.request.Request('https://api.github.com/repos/zxl123456123/control-everything/releases/tags/v0.1.0a19',headers={'User-Agent':'session-panel-qa-smoke'})
    with urllib.request.urlopen(request,timeout=60) as response:
        release=json.load(response)
    assert release['id']==442114476 and release['draft'] is False, 'public_asset_read'
    result['public_release_id']=release['id']
print(json.dumps(result),flush=True)
'@ | Set-Content -LiteralPath $probe -Encoding utf8
    $script = Join-Path $Root 'run.py'
    @'
import ctypes,os,pathlib,runpy,sys
root=pathlib.Path(__file__).parent
for name,folder in [('USERPROFILE',0x28),('APPDATA',0x1a),('LOCALAPPDATA',0x1c)]:
    buffer=ctypes.create_unicode_buffer(260)
    assert ctypes.windll.shell32.SHGetFolderPathW(None,folder,None,0,buffer)==0, name
    os.environ[name]=buffer.value
(root/'tmp').mkdir()
os.environ['TEMP']=os.environ['TMP']=str(root/'tmp')
runpy.run_path(str(root/'identity.py'),run_name='__main__')
if (root/'candidate').is_dir():
    sys.argv=[str(root/'verifier.py'),'--payload',str(root/'candidate'),'--installer',str(root/'candidate/installer.exe'),'--second-payload',str(root/'baseline'),'--second-installer',str(root/'baseline/installer.exe'),'--evidence',str(root/'evidence')]
    runpy.run_path(str(root/'verifier.py'),run_name='__main__')
'@ | Set-Content -LiteralPath $script -Encoding utf8
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName=$Python; $info.Arguments='-I -B -X utf8 "'+$script+'"'
    $info.WorkingDirectory=$Root; $info.Domain=$env:COMPUTERNAME; $info.UserName=$name
    $info.Password=$password; $info.LoadUserProfile=$true; $info.UseShellExecute=$false; $info.CreateNoWindow=$true
    $info.EnvironmentVariables.Clear()
    foreach($key in @('SystemRoot','WINDIR','COMSPEC')) { $info.EnvironmentVariables[$key]=[Environment]::GetEnvironmentVariable($key) }
    $info.EnvironmentVariables['PATH']=Join-Path $env:SystemRoot 'System32'
    $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
    $process=[Diagnostics.Process]::Start($info)
    $stdout=$process.StandardOutput.ReadToEndAsync(); $stderr=$process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    [IO.File]::WriteAllText((Join-Path $Root 'verifier.stdout'),$stdout.Result)
    [IO.File]::WriteAllText((Join-Path $Root 'verifier.stderr'),$stderr.Result)
    $report.exitCode=$process.ExitCode
    if($process.ExitCode -ne 0) { throw 'Verifier failed' }
    $productReport=Join-Path $Root 'evidence/report.json'
    if(Test-Path $productReport) {
        $product=Get-Content $productReport -Raw | ConvertFrom-Json
        if($product.status -ne 'passed' -or $product.errors.Count) { throw 'Acceptance report failed' }
        $ports=@($product.probes | ForEach-Object http_port)
        $report.portsClosed=@($ports | ForEach-Object { @{port=$_;closed= -not [bool](Get-NetTCPConnection -State Listen -LocalPort $_ -ErrorAction SilentlyContinue)} })
        if($report.portsClosed | Where-Object { -not $_.closed }) { throw 'Acceptance port retained' }
    }
    $report.status='passed'
} catch { $report.errors+= $_.Exception.ToString() }
finally {
    if($account) {
        try { Remove-LocalUser -SID $account.SID; $report.accountRemoved=$true }
        catch { $report.errors+='Account cleanup failed'; $report.status='failed' }
    }
    $report | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $Root 'admin-report.json') -Encoding utf8
    $archive=Join-Path $Root 'reports.zip'
    $files=@(Get-ChildItem $Root -File | Where-Object Name -in @('admin-report.json','verifier.stdout','verifier.stderr'))
    if(Test-Path (Join-Path $Root 'evidence')) { $files+=Get-ChildItem (Join-Path $Root 'evidence') -File }
    Compress-Archive -LiteralPath $files.FullName -DestinationPath $archive
    $rsa=[Security.Cryptography.RSA]::Create(); $rsa.ImportFromPem($env:QA_PUBLIC_KEY)
    $key=[Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $nonce=[Security.Cryptography.RandomNumberGenerator]::GetBytes(12)
    $data=[IO.File]::ReadAllBytes($archive); $cipher=[byte[]]::new($data.Length); $tag=[byte[]]::new(16)
    $aes=[Security.Cryptography.AesGcm]::new($key,16); $aes.Encrypt($nonce,$data,$cipher,$tag)
    @{schema=1;algorithm='RSA-OAEP-SHA256+AES-256-GCM';key=[Convert]::ToBase64String($rsa.Encrypt($key,[Security.Cryptography.RSAEncryptionPadding]::OaepSHA256));nonce=[Convert]::ToBase64String($nonce);tag=[Convert]::ToBase64String($tag);ciphertext=[Convert]::ToBase64String($cipher)} | ConvertTo-Json | Set-Content (Join-Path $Root 'reports.encrypted.json') -Encoding utf8
    $aes.Dispose(); $rsa.Dispose()
}
if($report.status -ne 'passed') { exit 1 }
