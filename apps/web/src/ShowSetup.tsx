import { ShowSetup as CoreShowSetup } from "./ShowSetupCore";
import { ProviderControls } from "./ProviderControls";
import { AlbumUpload } from "./AlbumUpload";
export function ShowSetup(props: Parameters<typeof CoreShowSetup>[0]) {
  return <><ProviderControls {...props} /><AlbumUpload {...props} /><CoreShowSetup {...props} /></>;
}
