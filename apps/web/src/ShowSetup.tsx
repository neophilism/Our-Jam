import { ShowSetup as CoreShowSetup } from "./ShowSetupCore";
import { ProviderControls } from "./ProviderControls";
export function ShowSetup(props: Parameters<typeof CoreShowSetup>[0]) {
  return <><ProviderControls {...props} /><CoreShowSetup {...props} /></>;
}
