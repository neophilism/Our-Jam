import { ShowSetup as CoreShowSetup } from "./ShowSetupCore";
import { ProviderControls } from "./ProviderControls";
import { AlbumUpload } from "./AlbumUpload";
import { ShowWindows } from "./ShowWindows";
export function ShowSetup(props: Parameters<typeof CoreShowSetup>[0]) {
  return <><ShowWindows data={props.data} /><ProviderControls {...props} /><AlbumUpload {...props} /><CoreShowSetup {...props} /></>;
}
