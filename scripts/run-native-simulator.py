#!/usr/bin/env python3
"""Run native UI acceptance on an Xcode-eligible device; preserve failure evidence."""
import json
import os
import re
import signal
import subprocess
from pathlib import Path

evidence = Path('ios-evidence')
evidence.mkdir(exist_ok=True)

def command(args, timeout, log_name):
    print('+', ' '.join(args), flush=True)
    with (evidence / log_name).open('w') as log:
        process = subprocess.Popen(args, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            status = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            raise RuntimeError(f'{args[0]} exceeded its {timeout}-second diagnostic deadline; see {log_name}')
    text = (evidence / log_name).read_text(errors='replace')
    print(text[-18000:], flush=True)
    if status:
        raise RuntimeError(f'{args[0]} failed with exit {status}; see {log_name}')
    return text

failure = None
try:
    sdk = subprocess.check_output(['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-version'], text=True, timeout=30).strip()
    listing = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devices', 'available', '-j'], timeout=60))
    # A simctl bootable device is not necessarily an eligible Xcode run target.
    # The old code blindly chose the first iOS 18.6 phone despite using SDK 26.2.
    build = ['xcodebuild', '-project', 'apps/ios/OurJam.xcodeproj', '-scheme', 'OurJam', '-configuration', 'Release', '-sdk', 'iphonesimulator']
    destinations = command(build + ['-showdestinations', 'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-'], 180, 'eligible-destinations.log')
    eligible = set(re.findall(r'platform:iOS Simulator,[^\n}]*?id:([A-Fa-f0-9-]{36})', destinations))
    candidates = [dict(d, runtime=runtime) for runtime, devices in listing['devices'].items() if '.iOS-' in runtime for d in devices if d.get('isAvailable', True) and d['udid'] in eligible and (d['name'].startswith('iPhone') or d['name'].startswith('iPad'))]
    def preference(device):
        version = tuple(int(x) for x in device['runtime'].split('.iOS-')[-1].split('-'))
        exact = version[:2] == tuple(int(x) for x in sdk.split('.')[:2])
        return (exact, device['name'].startswith('iPhone'), version, device.get('state') == 'Booted')
    candidates.sort(key=preference, reverse=True)
    if not candidates:
        raise RuntimeError('The selected Xcode SDK has no eligible installed iOS Simulator device. See eligible-destinations.log; no interaction test was bypassed.')
    chosen = candidates[0]
    device = chosen['udid']
    (evidence / 'device.json').write_text(json.dumps(dict(chosen, sdk=sdk), indent=2))
    if chosen.get('state') != 'Booted':
        command(['xcrun', 'simctl', 'boot', device], 60, 'boot.log')
    command(['xcrun', 'simctl', 'bootstatus', device, '-b'], 300, 'boot-status.log')
    # Use the same SDK/configuration/DerivedData as the compiled user artifact.
    # This avoids recompiling a second Debug app and tests the Release code path.
    command(build + ['-destination', f'platform=iOS Simulator,id={device}', '-destination-timeout', '90', '-parallel-testing-enabled', 'NO', '-derivedDataPath', 'ios-build', '-resultBundlePath', 'ios-evidence/NativeTests.xcresult', 'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-', 'test'], 720, 'tests.log')
except Exception as error:
    failure = error
finally:
    try:
        result = subprocess.run(['xcrun', 'simctl', 'list', 'devices', 'available', '-j'], capture_output=True, text=True, timeout=30)
        (evidence / 'devices-after.json').write_text(result.stdout)
        devices = json.loads(result.stdout).get('devices', {})
        for runtime, entries in devices.items():
            if 'iOS' not in runtime:
                continue
            for entry in entries:
                if entry.get('state') == 'Booted':
                    subprocess.run(['xcrun', 'simctl', 'io', entry['udid'], 'screenshot', str(evidence / (entry['udid'] + '.png'))], timeout=30, check=False)
        bundle = evidence / 'NativeTests.xcresult'
        if bundle.exists():
            subprocess.run(['xcrun', 'xcresulttool', 'export', 'attachments', '--path', str(bundle), '--output-path', str(evidence / 'attachments')], timeout=60, check=False)
    except Exception as error:
        print('Diagnostic collection:', error, flush=True)
if failure:
    raise failure
