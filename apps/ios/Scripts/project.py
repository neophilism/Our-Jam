#!/usr/bin/env python3
"""Generate a dependency-free, deterministic Xcode application project."""
from pathlib import Path
import hashlib
root = Path(__file__).resolve().parents[1]
def uid(name: str) -> str:
    return hashlib.sha256(name.encode()).hexdigest()[:24].upper()
objects = []
def obj(name: str, value: str) -> str:
    ident = uid(name)
    objects.append(f"{ident} = {{ {value} }};")
    return ident
sources = ["Core.swift", "SessionStore.swift", "OurJamApp.swift"]
refs, builds = [], []
for source in sources:
    refs.append(obj("ref:" + source, f'isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = "Sources/{source}"; sourceTree = "<group>";'))
    builds.append(obj("build:" + source, f"isa = PBXBuildFile; fileRef = {refs[-1]};"))
product = obj("product", 'isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = OurJam.app; sourceTree = BUILT_PRODUCTS_DIR;')
products = obj("products", f'isa = PBXGroup; children = ({product},); name = Products; sourceTree = "<group>";')
group = obj("group", f'isa = PBXGroup; children = ({",".join(refs + [products])},); sourceTree = "<group>";')
phase = obj("sources", f'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ({",".join(builds)},); runOnlyForDeploymentPostprocessing = 0;')
frameworks = obj("frameworks", 'isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;')
configs, target_configs = [], []
for mode in ["Debug", "Release"]:
    configs.append(obj("project:" + mode, f'isa = XCBuildConfiguration; name = {mode}; buildSettings = {{ SDKROOT = iphoneos; IPHONEOS_DEPLOYMENT_TARGET = 16.0; CLANG_ENABLE_MODULES = YES; SWIFT_VERSION = 5.0; }};'))
    optimization = "-Onone" if mode == "Debug" else "-O"
    target_configs.append(obj("target:" + mode, f'''isa = XCBuildConfiguration; name = {mode}; buildSettings = {{
      PRODUCT_NAME = OurJam; PRODUCT_BUNDLE_IDENTIFIER = com.neophilism.ourjam.rehearsal;
      INFOPLIST_FILE = Info.plist; TARGETED_DEVICE_FAMILY = "1,2"; SWIFT_VERSION = 5.0;
      SWIFT_OPTIMIZATION_LEVEL = "{optimization}"; GENERATE_INFOPLIST_FILE = NO;
      CODE_SIGN_STYLE = Automatic; MARKETING_VERSION = 0.1.0; CURRENT_PROJECT_VERSION = 1;
      ENABLE_USER_SCRIPT_SANDBOXING = YES; SUPPORTS_MACCATALYST = NO;
    }};'''))
project_list = obj("project-list", f'isa = XCConfigurationList; buildConfigurations = ({",".join(configs)},); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
target_list = obj("target-list", f'isa = XCConfigurationList; buildConfigurations = ({",".join(target_configs)},); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
target = obj("target", f'''isa = PBXNativeTarget; buildConfigurationList = {target_list}; buildPhases = ({phase},{frameworks},);
 buildRules = (); dependencies = (); name = OurJam; productName = OurJam; productReference = {product}; productType = "com.apple.product-type.application";''')
project = obj("project", f'''isa = PBXProject; attributes = {{ LastUpgradeCheck = 1600; }}; buildConfigurationList = {project_list};
 compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en,Base,);
 mainGroup = {group}; productRefGroup = {products}; projectDirPath = ""; projectRoot = ""; targets = ({target},);''')
p = root / "OurJam.xcodeproj"
p.mkdir(exist_ok=True)
(p / "project.pbxproj").write_text("// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n" + "\n".join(objects) + f"\n}}; rootObject = {project}; }}\n")
schemes = p / "xcshareddata/xcschemes"
schemes.mkdir(parents=True, exist_ok=True)
(schemes / "OurJam.xcscheme").write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="OurJam.app" BlueprintName="OurJam" ReferencedContainer="container:OurJam.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="OurJam.app" BlueprintName="OurJam" ReferencedContainer="container:OurJam.xcodeproj"/></BuildableProductRunnable></LaunchAction><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>''')
print("Generated OurJam.xcodeproj without external project-generation dependencies.")
