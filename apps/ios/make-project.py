#!/usr/bin/env python3
"""Generate a deterministic, dependency-free Xcode app and UI-test project."""
import hashlib
import json
from pathlib import Path
root = Path(__file__).resolve().parent
objects = {}
def ident(label):
    return hashlib.sha256(label.encode()).hexdigest()[:24].upper()
def add(label, isa, **values):
    key = ident(label)
    objects[key] = dict(isa=isa, **values)
    return key
def render(value):
    if isinstance(value, dict):
        return '{\n' + '\n'.join(f'{json.dumps(str(k))} = {render(v)};' for k, v in value.items()) + '\n}'
    if isinstance(value, list): return '(' + ','.join(render(v) for v in value) + ')'
    return json.dumps(str(value))
project = ident('project')
products = add('products', 'PBXGroup', children=[], name='Products', sourceTree='<group>')
groups = []
base_settings = {'CLANG_ENABLE_MODULES': 'YES', 'SDKROOT': 'iphoneos', 'IPHONEOS_DEPLOYMENT_TARGET': '17.0', 'SWIFT_VERSION': '5.0', 'TARGETED_DEVICE_FAMILY': '1,2', 'CODE_SIGN_STYLE': 'Automatic', 'ENABLE_USER_SCRIPT_SANDBOXING': 'YES', 'SWIFT_STRICT_CONCURRENCY': 'targeted'}
def configs(label, settings):
    refs = []
    for variant in ['Debug', 'Release']:
        s = dict(settings)
        s['SWIFT_OPTIMIZATION_LEVEL'] = '-Onone' if variant == 'Debug' else '-O'
        if variant == 'Debug': s['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = 'DEBUG'
        refs.append(add(label+variant, 'XCBuildConfiguration', name=variant, buildSettings=s))
    return add(label+'configs', 'XCConfigurationList', buildConfigurations=refs, defaultConfigurationIsVisible='0', defaultConfigurationName='Release')
project_configs = configs('project', base_settings)
def target(name, files, product, product_type, settings, dependencies=None):
    source_refs, builds = [], []
    for file in files:
        ref = add(name+file, 'PBXFileReference', lastKnownFileType='sourcecode.swift', path=file, sourceTree='<group>')
        source_refs.append(ref)
        builds.append(add(name+file+'build', 'PBXBuildFile', fileRef=ref))
    groups.append(add(name+'group', 'PBXGroup', children=source_refs, path=name, sourceTree='<group>'))
    product_ref = add(name+'product', 'PBXFileReference', explicitFileType='wrapper.application' if product_type.endswith('application') else 'wrapper.cfbundle', includeInIndex='0', path=product, sourceTree='BUILT_PRODUCTS_DIR')
    objects[products]['children'].append(product_ref)
    sources = add(name+'sources', 'PBXSourcesBuildPhase', buildActionMask='2147483647', files=builds, runOnlyForDeploymentPostprocessing='0')
    frameworks = add(name+'frameworks', 'PBXFrameworksBuildPhase', buildActionMask='2147483647', files=[], runOnlyForDeploymentPostprocessing='0')
    resources = add(name+'resources', 'PBXResourcesBuildPhase', buildActionMask='2147483647', files=[], runOnlyForDeploymentPostprocessing='0')
    return add(name+'target', 'PBXNativeTarget', buildConfigurationList=configs(name, dict(base_settings, **settings)), buildPhases=[sources, frameworks, resources], buildRules=[], dependencies=dependencies or [], name=name, productName=name, productReference=product_ref, productType=product_type)
app = target('OurJam', ['Models.swift', 'API.swift', 'SessionModel.swift', 'OurJamApp.swift', 'NativeAccountControls.swift'], 'OurJam.app', 'com.apple.product-type.application', {'PRODUCT_NAME': '$(TARGET_NAME)', 'PRODUCT_BUNDLE_IDENTIFIER': 'com.neophilism.ourjam', 'INFOPLIST_FILE': 'OurJam/Info.plist', 'GENERATE_INFOPLIST_FILE': 'NO', 'LD_RUNPATH_SEARCH_PATHS': ['$(inherited)', '@executable_path/Frameworks'], 'SUPPORTED_PLATFORMS': 'iphoneos iphonesimulator', 'CODE_SIGN_IDENTITY[sdk=iphonesimulator*]': '-', 'CODE_SIGN_ENTITLEMENTS[sdk=iphonesimulator*]': 'OurJam/Simulator.entitlements'})
proxy = add('appproxy', 'PBXContainerItemProxy', containerPortal=project, proxyType='1', remoteGlobalIDString=app, remoteInfo='OurJam')
dep = add('testdepends', 'PBXTargetDependency', target=app, targetProxy=proxy)
tests = target('OurJamUITests', ['OurJamUITests.swift'], 'OurJamUITests.xctest', 'com.apple.product-type.bundle.ui-testing', {'PRODUCT_NAME': '$(TARGET_NAME)', 'PRODUCT_BUNDLE_IDENTIFIER': 'com.neophilism.ourjam.uitests', 'GENERATE_INFOPLIST_FILE': 'YES', 'TEST_TARGET_NAME': 'OurJam', 'LD_RUNPATH_SEARCH_PATHS': ['$(inherited)', '@executable_path/Frameworks', '@loader_path/Frameworks']}, [dep])
main_group = add('maingroup', 'PBXGroup', children=groups+[products], sourceTree='<group>')
objects[project] = dict(isa='PBXProject', attributes={'LastUpgradeCheck': '1600', 'BuildIndependentTargetsInParallel': 'YES', 'TargetAttributes': {app: {'CreatedOnToolsVersion': '16.0'}, tests: {'CreatedOnToolsVersion': '16.0', 'TestTargetID': app}}}, buildConfigurationList=project_configs, compatibilityVersion='Xcode 14.0', developmentRegion='en', hasScannedForEncodings='0', knownRegions=['en', 'Base'], mainGroup=main_group, productRefGroup=products, projectDirPath='', projectRoot='', targets=[app, tests])
project_dir = root / 'OurJam.xcodeproj'
project_dir.mkdir(exist_ok=True)
(project_dir / 'project.pbxproj').write_text('// !$*UTF8*$!\n' + render({'archiveVersion': '1', 'classes': {}, 'objectVersion': '56', 'objects': objects, 'rootObject': project}))
schemes = project_dir / 'xcshareddata' / 'xcschemes'
schemes.mkdir(parents=True, exist_ok=True)
def reference(key, name, product):
    return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{key}" BuildableName="{product}" BlueprintName="{name}" ReferencedContainer="container:OurJam.xcodeproj"/>'
app_ref = reference(app, 'OurJam', 'OurJam.app')
test_ref = reference(tests, 'OurJamUITests', 'OurJamUITests.xctest')
(schemes / 'OurJam.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{app_ref}</BuildActionEntry></BuildActionEntries></BuildAction>
<TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO">{test_ref}</TestableReference></Testables></TestAction>
<LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="NO"><BuildableProductRunnable runnableDebuggingMode="0">{app_ref}</BuildableProductRunnable></LaunchAction>
<ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">{app_ref}</BuildableProductRunnable></ProfileAction>
<AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>''')
print(project_dir)
