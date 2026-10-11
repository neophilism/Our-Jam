#!/usr/bin/env python3
"""Bound native CI startup/testing and preserve diagnostic screenshots on failure."""
import json
import os
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
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            raise RuntimeError(f'{args[0]} exceeded its {timeout}-second diagnostic deadline; see {log_name}')
    tail = (evidence / log_name).read_text(errors='replace')[-18000:]
    print(tail, flush=True)
    if status: raise RuntimeError(f'{args[0]} failed with exit {status}; see {log_name}')

failure = None
try:
    listing = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devices', 'available', '-j'], timeout=30))
    candidates = [d for runtime, devices in listing['devices'].items() if 'iOS' in runtime for d in devices if d['name'].startswith('iPhone')]
    if not candidates: raise RuntimeError('This runner has no available iPhone Simulator runtime.')
    device = candidates[0]['udid']
    (evidence / 'device.json').write_text(json.dumps(candidates[0], indent=2))
    if candidates[0].get('state') != 'Booted':
        command(['xcrun', 'simctl', 'boot', device], 60, 'boot.log')
    command(['xcrun', 'simctl', 'bootstatus', device, '-b'], 240, 'boot-status.log')
    command(['xcodebuild', '-project', 'apps/ios/OurJam.xcodeproj', '-scheme', 'OurJam', '-configuration', 'Debug', '-destination', f'platform=iOS Simulator,id={device}', '-destination-timeout', '60', '-parallel-testing-enabled', 'NO', '-derivedDataPath', 'ios-test-build', '-resultBundlePath', 'ios-evidence/NativeTests.xcresult', 'CODE_SIGNING_ALLOWED=NO', 'test'], 480, 'tests.log')
except Exception as error:
    failure = error
finally:
    try:
        result = subprocess.run(['xcrun', 'simctl', 'list', 'devices', 'available', '-j'], capture_output=True, text=True, timeout=30)
        (evidence / 'devices-after.json').write_text(result.stdout)
        devices = json.loads(result.stdout).get('devices', {})
        for runtime, entries in devices.items():
            if 'iOS' not in runtime: continue
            for entry in entries:
                if entry.get('state') == 'Booted':
                    subprocess.run(['xcrun', 'simctl', 'io', entry['udid'], 'screenshot', str(evidence / (entry['udid'] + '.png'))], timeout=30, check=False)
        bundle = evidence / 'NativeTests.xcresult'
        if bundle.exists():
            subprocess.run(['xcrun', 'xcresulttool', 'export', 'attachments', '--path', str(bundle), '--output-path', str(evidence / 'attachments')], timeout=60, check=False)
    except Exception as error:
        print('Diagnostic collection:', error, flush=True)
if failure: raise failure
